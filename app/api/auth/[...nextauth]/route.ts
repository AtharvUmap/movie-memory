import { handlers } from "@/lib/auth";

// Auth.js handles every /api/auth/* route: sign-in, OAuth callback, sign-out, session.
export const { GET, POST } = handlers;
