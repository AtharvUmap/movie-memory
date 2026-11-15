import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

/** Runs once before all test files: rebuild the test DB from the migrations. */
export default function setup() {
  const { DATABASE_URL } = parse(readFileSync(".env.test"));

  // `migrate reset` deletes everything. Refuse anything that doesn't look like
  // a test database, so a misconfigured env can never wipe the dev DB.
  const dbName = new URL(DATABASE_URL ?? "").pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Refusing to reset "${dbName}": test database name must end in _test`,
    );
  }

  // Env vars passed here win over .env (dotenv never overrides existing vars).
  // Creates the database if it doesn't exist yet.
  execSync("npx prisma migrate reset --force", {
    env: { ...process.env, DATABASE_URL },
    stdio: "pipe",
  });
}
