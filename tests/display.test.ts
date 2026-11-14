import { describe, expect, it } from "vitest";
import { getDisplayName, getInitials } from "@/lib/display";

describe("getDisplayName", () => {
  it("uses the name when present", () => {
    expect(getDisplayName({ name: "Ada Lovelace", email: "ada@x.com" })).toBe(
      "Ada Lovelace",
    );
  });

  it("falls back to the email prefix when name is missing or blank", () => {
    expect(getDisplayName({ name: null, email: "jane.doe@x.com" })).toBe(
      "jane.doe",
    );
    expect(getDisplayName({ name: "   ", email: "jane@x.com" })).toBe("jane");
  });

  it('falls back to "Movie fan" when there is nothing usable', () => {
    expect(getDisplayName({ name: null, email: null })).toBe("Movie fan");
    expect(getDisplayName({ name: null, email: "@x.com" })).toBe("Movie fan");
  });
});

describe("getInitials", () => {
  it.each([
    ["Ada Lovelace", "AL"],
    ["Ada Byron Lovelace", "AL"],
    ["cher", "C"],
    ["jane.doe", "JD"],
    ["Movie fan", "MF"],
    ["élodie durand", "ÉD"],
    ["", "?"],
  ])("%s -> %s", (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });
});
