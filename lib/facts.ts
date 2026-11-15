import "server-only";
import { APIError } from "openai";
import { prisma } from "@/lib/db";
import { generateMovieFact } from "@/lib/openai";

/** A fact younger than this is reused instead of generating a new one. */
export const FACT_TTL_MS = 60_000;

// The OpenAI call runs inside the transaction (while holding the lock), so the
// transaction must outlive its worst case: 10s timeout x 2 attempts + backoff
// (~21s measured). Waiting requests also spend their wait inside this budget.
const GENERATION_TX_TIMEOUT_MS = 30_000;

// First key of the two-key advisory lock: a namespace, so these locks can't
// collide with other advisory locks the app might add later.
const FACT_LOCK_NAMESPACE = 1;

const factSelect = {
  id: true,
  movie: true,
  content: true,
  createdAt: true,
} as const;

export type FactResult = {
  fact: { id: string; movie: string; content: string; createdAt: Date };
  /** cache: reused (<60s old) · fresh: just generated · stale: generation failed, older fact reused */
  source: "cache" | "fresh" | "stale";
};

/** Generation failed and there is no earlier fact for this movie to fall back on. */
export class FactUnavailableError extends Error {
  constructor() {
    super("No fact available: generation failed and no previous fact exists");
    this.name = "FactUnavailableError";
  }
}

type Options = {
  /** Injected clock, so tests can control time. */
  now?: Date;
  /** Injected generator, so tests don't call OpenAI. */
  generate?: (movie: string) => Promise<string>;
};

/**
 * Return the user's latest fact for their current movie if it's younger than
 * FACT_TTL_MS; otherwise generate, store and return a new one.
 * `userId` must come from the session (see getCurrentUser), never from the request.
 */
export async function getOrCreateFact(
  userId: string,
  { now = new Date(), generate = generateMovieFact }: Options = {},
): Promise<FactResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { favoriteMovie: true },
  });
  if (!user?.favoriteMovie) {
    throw new Error("User has no favorite movie");
  }
  const movie = user.favoriteMovie;

  // Fast path: a cache hit needs no lock and no transaction.
  const cached = await findFreshFact(prisma, userId, movie, now);
  if (cached) return { fact: cached, source: "cache" };

  // Slow path: serialize generation per user, so a burst of requests (several
  // tabs, rapid refresh) produces one OpenAI call and one row, not N.
  return prisma.$transaction(
    async (tx) => {
      // Blocks until no other transaction holds this user's lock; released
      // automatically at commit/rollback. Other users have different keys,
      // so they never wait on each other (barring a rare hash collision).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${FACT_LOCK_NAMESPACE}::int, hashtext(${userId}))`;

      // Re-check inside the lock: if we waited, the request that held the lock
      // has probably just stored a fresh fact.
      const fresh = await findFreshFact(tx, userId, movie, now);
      if (fresh) return { fact: fresh, source: "cache" as const };

      let content: string;
      try {
        content = await generate(movie);
      } catch (error) {
        console.error("Fact generation failed", describeError(error));
        // Degrade gracefully: any earlier fact for this movie, however old,
        // beats an error. (Nothing was written, so the transaction just ends.)
        const previous = await findLatestFact(tx, userId, movie);
        if (previous) return { fact: previous, source: "stale" as const };
        throw new FactUnavailableError();
      }

      const fact = await tx.fact.create({
        // createdAt comes from the same clock as the age check (not the DB's
        // now()), so the 60s window is measured consistently, including in tests.
        data: { userId, movie, content, createdAt: now },
        select: factSelect,
      });
      return { fact, source: "fresh" as const };
    },
    {
      timeout: GENERATION_TX_TIMEOUT_MS,
      // Each waiting request holds a pooled connection while blocked on the
      // lock, so in a big burst the pool can run dry; let new requests wait
      // for a connection instead of failing after Prisma's 2s default.
      maxWait: GENERATION_TX_TIMEOUT_MS,
    },
  );
}

/** Latest fact for this user + movie, any age. */
function findLatestFact(
  db: Pick<typeof prisma, "fact">,
  userId: string,
  movie: string,
) {
  // Served by the (userId, movie, createdAt DESC) index. Filtering by movie
  // means a changed favorite never reuses facts about the old one.
  return db.fact.findFirst({
    where: { userId, movie },
    orderBy: { createdAt: "desc" },
    select: factSelect,
  });
}

/** Latest fact for this user + movie if younger than FACT_TTL_MS, else null. */
async function findFreshFact(
  db: Pick<typeof prisma, "fact">,
  userId: string,
  movie: string,
  now: Date,
) {
  const latest = await findLatestFact(db, userId, movie);
  const isFresh =
    latest && now.getTime() - latest.createdAt.getTime() < FACT_TTL_MS;
  return isFresh ? latest : null;
}

/**
 * Loggable summary of a generation error. For OpenAI API errors, log only the
 * status/code: their messages can echo request details (e.g. a 401 shows
 * a partially masked API key), and logs shouldn't hold secrets.
 */
function describeError(error: unknown) {
  if (error instanceof APIError) {
    // e.g. { status: 401, code: "invalid_api_key" }, { status: 429, code: "rate_limit_exceeded" }
    return { openaiError: true, status: error.status, code: error.code };
  }
  if (error instanceof Error) {
    return { type: error.name, message: error.message };
  }
  return { type: typeof error };
}
