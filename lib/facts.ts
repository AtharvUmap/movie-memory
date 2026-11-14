import "server-only";
import { prisma } from "@/lib/db";
import { generateMovieFact } from "@/lib/openai";

/**
 * Generate a new fact for the user's current favorite movie and store it.
 * `userId` must come from the session (see getCurrentUser), never from the request.
 */
export async function getFactForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { favoriteMovie: true },
  });
  if (!user?.favoriteMovie) {
    throw new Error("User has no favorite movie");
  }

  const content = await generateMovieFact(user.favoriteMovie);

  return prisma.fact.create({
    // Store the title the fact was generated for (see Fact.movie in the schema).
    data: { userId, movie: user.favoriteMovie, content },
    select: { id: true, movie: true, content: true, createdAt: true },
  });
}
