import { asc, eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { categories } from "../../db/schema";
import { conflict, notFound } from "../../lib/errors";
import type { CreateCategoryInput, UpdateCategoryInput } from "./categories.schema";

export async function listCategories(db: DB) {
  return db.select().from(categories).orderBy(asc(categories.nameEn));
}

export async function getCategory(db: DB, id: string) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!row) throw notFound("CATEGORY_NOT_FOUND", "Category not found");
  return row;
}

export async function createCategory(db: DB, input: CreateCategoryInput) {
  const [dup] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, input.slug))
    .limit(1);
  if (dup) throw conflict("CATEGORY_SLUG_TAKEN", `Slug "${input.slug}" is already in use`);

  const [row] = await db.insert(categories).values(input).returning();
  return row!;
}

export async function updateCategory(db: DB, id: string, input: UpdateCategoryInput) {
  if (Object.keys(input).length === 0) return getCategory(db, id);

  if (input.slug) {
    const [dup] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, input.slug))
      .limit(1);
    if (dup && dup.id !== id) {
      throw conflict("CATEGORY_SLUG_TAKEN", `Slug "${input.slug}" is already in use`);
    }
  }

  const [row] = await db
    .update(categories)
    .set(input)
    .where(eq(categories.id, id))
    .returning();
  if (!row) throw notFound("CATEGORY_NOT_FOUND", "Category not found");
  return row;
}

export async function deleteCategory(db: DB, id: string) {
  const [row] = await db
    .delete(categories)
    .where(eq(categories.id, id))
    .returning({ id: categories.id });
  if (!row) throw notFound("CATEGORY_NOT_FOUND", "Category not found");
}
