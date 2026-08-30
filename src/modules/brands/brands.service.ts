import { asc, eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { brands } from "../../db/schema";
import { conflict, notFound } from "../../lib/errors";
import type { CreateBrandInput, UpdateBrandInput } from "./brands.schema";

export async function listBrands(db: DB) {
  return db.select().from(brands).orderBy(asc(brands.name));
}

export async function getBrand(db: DB, id: string) {
  const [row] = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
  if (!row) throw notFound("BRAND_NOT_FOUND", "Brand not found");
  return row;
}

async function assertSlugFree(db: DB, slug: string, exceptId?: string) {
  const [dup] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.slug, slug))
    .limit(1);
  if (dup && dup.id !== exceptId) {
    throw conflict("BRAND_SLUG_TAKEN", `Slug "${slug}" is already in use`);
  }
}

export async function createBrand(db: DB, input: CreateBrandInput) {
  await assertSlugFree(db, input.slug);
  const [row] = await db.insert(brands).values(input).returning();
  return row!;
}

export async function updateBrand(db: DB, id: string, input: UpdateBrandInput) {
  if (Object.keys(input).length === 0) return getBrand(db, id);
  if (input.slug) await assertSlugFree(db, input.slug, id);
  const [row] = await db.update(brands).set(input).where(eq(brands.id, id)).returning();
  if (!row) throw notFound("BRAND_NOT_FOUND", "Brand not found");
  return row;
}

export async function deleteBrand(db: DB, id: string) {
  const [row] = await db
    .delete(brands)
    .where(eq(brands.id, id))
    .returning({ id: brands.id });
  if (!row) throw notFound("BRAND_NOT_FOUND", "Brand not found");
}
