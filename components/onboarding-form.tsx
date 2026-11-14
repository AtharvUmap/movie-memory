"use client";

import { useActionState } from "react";
import {
  saveFavoriteMovie,
  type OnboardingState,
} from "@/app/onboarding/actions";
import { MOVIE_MAX_LENGTH } from "@/lib/validation";

const initialState: OnboardingState = {};

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    saveFavoriteMovie,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-3">
      <label htmlFor="movie" className="text-left text-sm font-medium">
        Favorite movie
      </label>
      {/* required/maxLength are UX hints only; the server action validates. */}
      <input
        id="movie"
        name="movie"
        type="text"
        required
        maxLength={MOVIE_MAX_LENGTH}
        autoComplete="off"
        placeholder="e.g. Spirited Away"
        defaultValue={state.movie}
        // Remount with the echoed value after each submit (React resets forms).
        key={state.movie}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "movie-error" : undefined}
        className="rounded-lg border border-zinc-300 px-4 py-2.5 outline-none focus:border-zinc-900 aria-invalid:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
      />
      {state.error && (
        <p
          id="movie-error"
          role="alert"
          className="text-left text-sm text-red-600"
        >
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
