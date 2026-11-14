"use client"; // Error boundaries must be Client Components.

import { ErrorView } from "@/components/error-view";

// Catches unexpected errors in any page under app/ (not in the root layout itself).
export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <ErrorView
      title="Something went wrong"
      message="An unexpected error occurred. Please try again."
      error={error}
      retry={retry}
    />
  );
}
