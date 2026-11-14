"use client"; // Error boundaries must be Client Components.

import { ErrorView } from "@/components/error-view";

// Dashboard-specific fallback (e.g. the database is unreachable). The fact box
// handles its own OpenAI errors, so this only shows for unexpected failures.
export default function DashboardError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <ErrorView
      title="We couldn't load your dashboard"
      message="Your data is safe. This is usually temporary, so please try again in a moment."
      error={error}
      retry={retry}
    />
  );
}
