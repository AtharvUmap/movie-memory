import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

// Google reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET, and Auth.js reads AUTH_SECRET,
// from the environment automatically.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  // Sessions live in the Session table; the cookie only holds a random token.
  // Lets us revoke a session by deleting its row (a JWT can't be revoked).
  session: { strategy: "database" },
  callbacks: {
    // With database sessions, `session` is the raw Session row (including the
    // secret sessionToken) and `user` is the full User row. Whatever we return
    // here is also served as JSON at /api/auth/session, so build an explicit
    // allow-list instead of returning `session` as-is.
    session({ session, user }) {
      return {
        expires: session.expires,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
      };
    },
  },
});
