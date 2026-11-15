import { RetryButton } from "@/components/retry-button";
import {
  FactUnavailableError,
  getOrCreateFact,
  type FactResult,
} from "@/lib/facts";

const cardClass =
  "mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800";
const labelClass =
  "text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400";

/** Async server component: render it inside <Suspense fallback={<MovieFactSkeleton />}>. */
export async function MovieFact({ userId }: { userId: string }) {
  let result: FactResult;
  try {
    result = await getOrCreateFact(userId);
  } catch (error) {
    // Unexpected errors (DB down, bugs) go to the dashboard error boundary.
    if (!(error instanceof FactUnavailableError)) throw error;
    // Already logged in lib/facts.ts; show a friendly message only.
    return (
      <div className={cardClass} role="status">
        <p className={labelClass}>Fun fact</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          We couldn&apos;t come up with a fact right now.
        </p>
        <RetryButton />
      </div>
    );
  }

  const { fact, source } = result;
  return (
    <div className={cardClass}>
      <p className={labelClass}>Fun fact</p>
      <p className="mt-1 leading-relaxed">{fact.content}</p>
      {source === "stale" && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Couldn&apos;t fetch a new fact, so here&apos;s a previous one.
        </p>
      )}
    </div>
  );
}

export function MovieFactSkeleton() {
  return (
    <div className={cardClass} aria-busy="true" aria-label="Loading a fun fact">
      <p className={labelClass}>Fun fact</p>
      <div className="mt-2 space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
