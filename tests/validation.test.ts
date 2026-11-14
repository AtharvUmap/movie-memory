import { describe, expect, it } from "vitest";
import { movieSchema } from "@/lib/validation";

describe("movieSchema", () => {
  it("trims and collapses internal whitespace", () => {
    expect(movieSchema.parse("  The \t Matrix\n ")).toBe("The Matrix");
  });

  it("accepts exactly 100 characters", () => {
    expect(movieSchema.parse("a".repeat(100))).toHaveLength(100);
  });

  it("checks length after normalizing", () => {
    // 100 visible chars + surrounding spaces is still fine.
    expect(movieSchema.safeParse(`  ${"a".repeat(100)}  `).success).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   \t\n "],
    ["101 characters", "a".repeat(101)],
    ["control character", "Heat\u0000"],
    ["bell character", "Al\u0007ien"],
    ["not a string", null],
    ["number", 42],
  ])("rejects %s", (_label, input) => {
    expect(movieSchema.safeParse(input).success).toBe(false);
  });

  it("keeps unicode titles", () => {
    expect(movieSchema.parse("Amélie")).toBe("Amélie");
    expect(movieSchema.parse("千と千尋の神隠し")).toBe("千と千尋の神隠し");
  });
});
