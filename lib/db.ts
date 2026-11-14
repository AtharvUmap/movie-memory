import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // Prisma 7 talks to Postgres through a driver adapter (node-postgres here).
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// In dev, Next.js hot-reloads modules on every edit. Without this cache each
// reload would create a new client (and a new connection pool) until Postgres
// runs out of connections. Production loads the module once, so no cache needed.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
