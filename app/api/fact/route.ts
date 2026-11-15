import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { FactUnavailableError, getOrCreateFact } from "@/lib/facts";

// Per-user data: never let a browser or proxy cache it.
const noStore = { "Cache-Control": "no-store" };

/** GET /api/fact: the signed-in user's current fact (cached for 60s). */
export async function GET() {
  await connection(); // request-time only; never prerender (see lib/current-user.ts)

  const session = await auth();
  if (!session) {
    return Response.json(
      { error: "Not signed in" },
      { status: 401, headers: noStore },
    );
  }

  try {
    // The user id comes from the session; this route takes no parameters.
    // A "stale" fact is still a 200: the client gets a usable fact plus `source`.
    const { fact, source } = await getOrCreateFact(session.user.id);
    return Response.json({ ...fact, source }, { headers: noStore });
  } catch (error) {
    if (error instanceof FactUnavailableError) {
      // Upstream (OpenAI) failed and there's nothing to fall back on; already logged.
      return Response.json(
        { error: "Couldn't get a fact right now" },
        { status: 502, headers: noStore },
      );
    }
    console.error("GET /api/fact failed", error);
    return Response.json(
      { error: "Something went wrong" },
      { status: 500, headers: noStore },
    );
  }
}
