"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Re-renders the current page's server components (e.g. retries the fact). */
export function RetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="mt-3 rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      {pending ? "Trying…" : "Try again"}
    </button>
  );
}
