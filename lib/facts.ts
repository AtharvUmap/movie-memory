import "server-only";
import { prisma } from "@/lib/db";
import { generateMovieFact } from "@/lib/openai";

/** A fact younger than this is reused instead of generating a new one. */
export const FACT_TTL_MS = 60_000;

const factSelect = {
  id: true,
  movie: true,
  content: true,
  createdAt: true,
} as const;

export type FactResult = {
  fact: { id: string; movie: string; content: string; createdAt: Date };
  source: "cache" | "fresh";
};

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

  // Served by the (userId, movie, createdAt DESC) index. Filtering by movie
  // means a changed favorite never reuses facts about the old one.
  const latest = await prisma.fact.findFirst({
    where: { userId, movie },
    orderBy: { createdAt: "desc" },
    select: factSelect,
  });
  if (latest && now.getTime() - latest.createdAt.getTime() < FACT_TTL_MS) {
    return { fact: latest, source: "cache" };
  }

  const content = await generate(movie);
  const fact = await prisma.fact.create({
    // createdAt comes from the same clock as the age check above (not the DB's
    // now()), so the 60s window is measured consistently, including in tests.
    data: { userId, movie, content, createdAt: now },
    select: factSelect,
  });
  return { fact, source: "fresh" };
}
