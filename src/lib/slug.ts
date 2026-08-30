import { randomBytes } from "node:crypto";

/** Lowercase, hyphenated, ASCII-ish slug from arbitrary text. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-|-$/g, "");
  return base || "item";
}

/** Short random suffix to keep generated slugs unique. */
export function slugSuffix(len = 5): string {
  return randomBytes(8).toString("base64url").replace(/[^a-z0-9]/gi, "").slice(0, len).toLowerCase();
}
