import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createFact, createUser, resetDb, secondsBefore } from "./support/db";

// Route handler tested directly against the real test DB. Mocked:
// - auth(): decides who is signed in (the real one needs a Next request + cookies)
// - connection(): only meaningful inside a Next.js request
// - generateMovieFact(): never call OpenAI from tests
const { authMock, generateMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  generateMock: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/openai", () => ({ generateMovieFact: generateMock }));

const { GET } = await import("@/app/api/fact/route");

function signInAs(userId: string | null) {
  authMock.mockResolvedValue(
    userId ? { user: { id: userId }, expires: "2099-01-01" } : null,
  );
}

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  generateMock.mockImplementation(
    async (movie: string) => `fact about ${movie}`,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/fact", () => {
  it("8c. returns 401 without a session and touches nothing", async () => {
    signInAs(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not signed in" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("8d. returns only the signed-in user's fact", async () => {
    await createUser("alice", "Heat");
    await createUser("bob", "Heat");
    const alicesFact = await createFact("alice", "Heat", new Date());
    signInAs("bob");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ source: "fresh", movie: "Heat" });
    expect(body.id).not.toBe(alicesFact.id);
    const stored = await prisma.fact.findUniqueOrThrow({
      where: { id: body.id },
    });
    expect(stored.userId).toBe("bob");
  });

  it("returns a stale fact with 200 when generation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await createUser("alice", "Heat");
    const old = await createFact(
      "alice",
      "Heat",
      secondsBefore(new Date(), 600),
    );
    generateMock.mockRejectedValue(new Error("OpenAI is down"));
    signInAs("alice");

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: old.id, source: "stale" });
  });

  it("returns 502 with a generic message when no fact is available", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await createUser("alice", "Heat");
    generateMock.mockRejectedValue(new Error("SECRET upstream detail"));
    signInAs("alice");

    const res = await GET();
    const text = await res.text();

    expect(res.status).toBe(502);
    expect(text).not.toContain("SECRET");
    expect(JSON.parse(text)).toEqual({
      error: "Couldn't get a fact right now",
    });
  });
});
