import { prisma } from "@/lib/db";

/** Empty all tables (children first). Called before each DB test. */
export async function resetDb() {
  await prisma.fact.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
}

export function createUser(id: string, favoriteMovie: string | null) {
  return prisma.user.create({
    data: { id, email: `${id}@example.com`, name: id, favoriteMovie },
  });
}

export function createFact(
  userId: string,
  movie: string,
  createdAt: Date,
  content = `old fact about ${movie}`,
) {
  return prisma.fact.create({ data: { userId, movie, content, createdAt } });
}

/** A date `seconds` before `from`. */
export function secondsBefore(from: Date, seconds: number) {
  return new Date(from.getTime() - seconds * 1000);
}
