// Pure display helpers (no server-only: no secrets, safe anywhere).

/** Name to show: real name, else the part of the email before "@", else "Movie fan". */
export function getDisplayName(user: {
  name: string | null;
  email: string | null;
}): string {
  const name = user.name?.trim();
  if (name) return name;
  const emailPrefix = user.email?.split("@")[0]?.trim();
  if (emailPrefix) return emailPrefix;
  return "Movie fan";
}

/** Up to two uppercase initials, e.g. "Ada Lovelace" -> "AL", "jane.doe" -> "JD". */
export function getInitials(displayName: string): string {
  const words = displayName.split(/[\s._-]+/).filter(Boolean);
  const letters = [words[0], words.length > 1 ? words.at(-1) : undefined]
    // Array.from splits by code point, so emoji/accented letters stay whole.
    .map((word) => (word ? Array.from(word)[0] : ""))
    .join("");
  return letters.toUpperCase() || "?";
}
