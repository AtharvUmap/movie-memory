import type { DefaultSession } from "next-auth";

// Auth.js types session.user.id as optional. Our session callback always sets
// it, so declare it as a required string: no `!` or `?? ""` at call sites.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
