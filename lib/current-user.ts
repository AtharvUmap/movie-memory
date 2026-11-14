import "server-only";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * The signed-in user, freshly read from the DB, or null if signed out.
 * favoriteMovie comes from the DB (not the session) so it is never stale.
 */
export async function getCurrentUser() {
  // Mark this as request-time work. Without it, Cache Components tries to
  // prerender the page and fails on Auth.js's internal crypto calls.
  await connection();
  const session = await auth();
  if (!session) return null;

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      favoriteMovie: true,
    },
  });
}
