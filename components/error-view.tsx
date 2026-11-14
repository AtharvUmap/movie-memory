"use client";

import Link from "next/link";

type Props = {
  title: string;
  message: string;
  error: unknown;
  retry: () => void;
};

/** Shared fallback UI for error.tsx boundaries. Never shows the raw error text. */
export function ErrorView({ title, message, error, retry }: Props) {
  // Server errors reach the client as a generic message plus a `digest` that
  // matches the server log entry; show only the digest, as a support reference.
  const digest =
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : undefined;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">{message}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-full bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-zinc-300 px-5 py-2.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Go home
        </Link>
      </div>
      {digest && <p className="text-xs text-zinc-400">Reference: {digest}</p>}
    </main>
  );
}
