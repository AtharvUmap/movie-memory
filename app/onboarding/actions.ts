"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { movieSchema } from "@/lib/validation";

export type OnboardingState = {
  error?: string;
  // Echo the input back so the field keeps its value after an error.
  movie?: string;
};

export async function saveFavoriteMovie(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  // Server actions are public POST endpoints: re-check auth here, never rely
  // on the page having checked it.
  const session = await auth();
  if (!session) redirect("/");

  const raw = formData.get("movie");
  const parsed = movieSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid movie title.",
      movie: typeof raw === "string" ? raw : "",
    };
  }

  try {
    await prisma.user.update({
      // Scoped to the session user; the form never sends a user id.
      where: { id: session.user.id },
      data: { favoriteMovie: parsed.data },
    });
  } catch (error) {
    console.error("saveFavoriteMovie failed", error);
    return {
      error: "Couldn't save your movie. Please try again.",
      movie: parsed.data,
    };
  }

  // Outside the try: redirect() works by throwing.
  redirect("/dashboard");
}
