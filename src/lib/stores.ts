import { eq, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { stores } from "../db/schema";
import { slugify, slugSuffix } from "./slug";

/**
 * Canonicalise a free-text "where did you buy it" string to a store row.
 * Matches an existing store case-insensitively by name, else creates one.
 * Returns null for blank / junk input.
 */
export async function resolveStore(
  db: DB,
  rawName: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  const name = (rawName ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return null;

  const [existing] = await db
    .select({ id: stores.id, name: stores.name })
    .from(stores)
    .where(sql`lower(${stores.name}) = lower(${name})`)
    .limit(1);
  if (existing) return existing;

  let slug = slugify(name) || "store";
  for (let i = 0; i < 4; i++) {
    const [clash] = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.slug, slug))
      .limit(1);
    if (!clash) break;
    slug = `${slugify(name) || "store"}-${slugSuffix()}`;
  }

  const [created] = await db
    .insert(stores)
    .values({ slug, name })
    .returning({ id: stores.id, name: stores.name });
  return created ?? null;
}
