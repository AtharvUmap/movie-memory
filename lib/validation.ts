import { z } from "zod";

// No "server-only" here: plain validation rules, safe to share with client code.

export const MOVIE_MAX_LENGTH = 100;

/**
 * A favorite-movie title. Normalizes first, then validates, so "  The   Matrix "
 * is stored as "The Matrix" and the length limit applies to what we store.
 */
export const movieSchema = z
  .string({ error: "Please enter a movie title." })
  .transform((value) =>
    value
      .normalize("NFC") // same title typed differently -> same string
      .replace(/\s+/g, " ") // tabs, newlines, runs of spaces -> one space
      .trim(),
  )
  .pipe(
    z
      .string()
      .min(1, "Please enter a movie title.")
      .max(MOVIE_MAX_LENGTH, `Keep it under ${MOVIE_MAX_LENGTH} characters.`)
      // Whitespace control chars were already turned into spaces above; anything
      // left (e.g. \u0000) has no place in a title.
      .refine(
        (value) => !/\p{Cc}/u.test(value),
        "That title contains invalid characters.",
      ),
  );
