import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  FACT_TTL_MS,
  FactUnavailableError,
  getOrCreateFact,
} from "@/lib/facts";
import { createFact, createUser, resetDb, secondsBefore } from "./support/db";

// Real test database; only the OpenAI generator is faked (injected).
const NOW = new Date("2026-01-01T12:00:00Z");

function fakeGenerator(content = "a brand new fact") {
  return vi.fn(async (movie: string) => `${content} about ${movie}`);
}

function failingGenerator() {
  return vi.fn(async (): Promise<string> => {
    throw new Error("OpenAI is down");
  });
}

function factCount(userId: string) {
  return prisma.fact.count({ where: { userId } });
}

beforeEach(async () => {
  await resetDb();
  await createUser("alice", "Heat");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("getOrCreateFact", () => {
  it("1. generates and stores a fact when none exists", async () => {
    const generate = fakeGenerator();

    const result = await getOrCreateFact("alice", { now: NOW, generate });

    expect(result.source).toBe("fresh");
    expect(result.fact.content).toBe("a brand new fact about Heat");
    expect(generate).toHaveBeenCalledExactlyOnceWith("Heat");
    const stored = await prisma.fact.findUniqueOrThrow({
      where: { id: result.fact.id },
    });
    expect(stored).toMatchObject({ userId: "alice", movie: "Heat" });
    expect(stored.createdAt).toEqual(NOW);
  });

  it("2. returns the cached fact when it is 30s old, without generating", async () => {
    const existing = await createFact("alice", "Heat", secondsBefore(NOW, 30));
    const generate = fakeGenerator();

    const result = await getOrCreateFact("alice", { now: NOW, generate });

    expect(result).toMatchObject({
      source: "cache",
      fact: { id: existing.id },
    });
    expect(generate).not.toHaveBeenCalled();
    expect(await factCount("alice")).toBe(1);
  });

  it("3. generates a new fact when the latest is 61s old", async () => {
    const old = await createFact("alice", "Heat", secondsBefore(NOW, 61));
    const generate = fakeGenerator();

    const result = await getOrCreateFact("alice", { now: NOW, generate });

    expect(result.source).toBe("fresh");
    expect(result.fact.id).not.toBe(old.id);
    expect(generate).toHaveBeenCalledOnce();
    expect(await factCount("alice")).toBe(2);
  });

  it("treats a fact exactly FACT_TTL_MS old as expired", async () => {
    await createFact("alice", "Heat", secondsBefore(NOW, FACT_TTL_MS / 1000));
    const generate = fakeGenerator();

    const result = await getOrCreateFact("alice", { now: NOW, generate });

    expect(result.source).toBe("fresh");
  });

  it("4. generates a new fact when the recent fact is for a different movie", async () => {
    await createFact("alice", "Alien", secondsBefore(NOW, 5)); // old favorite
    const generate = fakeGenerator();

    const result = await getOrCreateFact("alice", { now: NOW, generate });

    expect(result).toMatchObject({ source: "fresh", fact: { movie: "Heat" } });
    expect(generate).toHaveBeenCalledExactlyOnceWith("Heat");
  });

  it("5. returns the latest old fact as stale when the generator throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await createFact("alice", "Heat", secondsBefore(NOW, 3600), "older");
    const latest = await createFact(
      "alice",
      "Heat",
      secondsBefore(NOW, 600),
      "latest",
    );

    const result = await getOrCreateFact("alice", {
      now: NOW,
      generate: failingGenerator(),
    });

    expect(result).toMatchObject({
      source: "stale",
      fact: { id: latest.id, content: "latest" },
    });
    expect(await factCount("alice")).toBe(2); // nothing written
    expect(console.error).toHaveBeenCalledWith(
      "Fact generation failed",
      expect.anything(),
    );
  });

  it("6. throws FactUnavailableError when the generator throws and no fact exists", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // An old fact for another movie must not be used as the fallback.
    await createFact("alice", "Alien", secondsBefore(NOW, 600));

    await expect(
      getOrCreateFact("alice", { now: NOW, generate: failingGenerator() }),
    ).rejects.toBeInstanceOf(FactUnavailableError);
    expect(await prisma.fact.count({ where: { movie: "Heat" } })).toBe(0);
  });

  it("7. five parallel calls generate exactly once and store one row", async () => {
    // Slow generator so all five calls overlap while the first one holds the lock.
    const generate = vi.fn(async (movie: string) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return `the only fact about ${movie}`;
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        getOrCreateFact("alice", { now: NOW, generate }),
      ),
    );

    expect(generate).toHaveBeenCalledOnce();
    expect(await factCount("alice")).toBe(1);
    expect(new Set(results.map((r) => r.fact.id)).size).toBe(1);
    expect(results.filter((r) => r.source === "fresh")).toHaveLength(1);
    expect(results.filter((r) => r.source === "cache")).toHaveLength(4);
  });

  it("8a. never returns another user's fact, even for the same movie", async () => {
    await createUser("bob", "Heat");
    const alicesFact = await createFact("alice", "Heat", secondsBefore(NOW, 5));
    const generate = fakeGenerator("bob's fact");

    const result = await getOrCreateFact("bob", { now: NOW, generate });

    expect(result.source).toBe("fresh");
    expect(result.fact.id).not.toBe(alicesFact.id);
    expect(generate).toHaveBeenCalledOnce();
    const stored = await prisma.fact.findUniqueOrThrow({
      where: { id: result.fact.id },
    });
    expect(stored.userId).toBe("bob");
  });

  it("8b. stale fallback never uses another user's fact", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await createUser("bob", "Heat");
    await createFact("alice", "Heat", secondsBefore(NOW, 600));

    await expect(
      getOrCreateFact("bob", { now: NOW, generate: failingGenerator() }),
    ).rejects.toBeInstanceOf(FactUnavailableError);
  });
});
