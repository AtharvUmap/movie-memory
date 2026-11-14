import { getFactForUser } from "@/lib/facts";

const cardClass =
  "mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800";
const labelClass =
  "text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400";

/** Async server component: render it inside <Suspense fallback={<MovieFactSkeleton />}>. */
export async function MovieFact({ userId }: { userId: string }) {
  let fact;
  try {
    fact = await getFactForUser(userId);
  } catch (error) {
    // Log the real reason on the server; show the user something friendly only.
    console.error("Fact generation failed", error);
    return (
      <div className={cardClass} role="status">
        <p className={labelClass}>Fun fact</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          We couldn&apos;t come up with a fact right now. Refresh the page to
          try again.
        </p>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <p className={labelClass}>Fun fact</p>
      <p className="mt-1 leading-relaxed">{fact.content}</p>
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
