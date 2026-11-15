import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

// Tests always use .env.test (a separate database), never .env.
const testEnv = parse(readFileSync(".env.test"));

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the "@/*" path alias from tsconfig.json.
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // `server-only` throws outside a React Server environment. Tests run
      // server code directly in Node, so swap it for an empty module here only.
      "server-only": fileURLToPath(
        new URL("./tests/support/empty.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: testEnv,
    // Resets and migrates the test database once before all tests.
    globalSetup: ["./tests/support/global-setup.ts"],
    // DB test files share one database, so run files one at a time.
    fileParallelism: false,
    // Allow `npm test` to pass before any tests exist.
    passWithNoTests: true,
  },
});
