import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { getOrCreateFact } from "@/lib/facts";

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
    const { fact, source } = await getOrCreateFact(session.user.id);
    return Response.json({ ...fact, source }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/fact failed", error);
    return Response.json(
      { error: "Couldn't get a fact right now" },
      { status: 502, headers: noStore },
    );
  }
}
