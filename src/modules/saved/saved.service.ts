import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { brands, categories, products, savedProducts } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { paginated, type PageParams } from "../../lib/pagination";

const categoryRef = {
  id: categories.id,
  slug: categories.slug,
  nameEn: categories.nameEn,
  nameBn: categories.nameBn,
};
const brandRef = { id: brands.id, slug: brands.slug, name: brands.name };

function mapProduct(row: {
  product: typeof products.$inferSelect;
  category: { id: string; slug: string; nameEn: string; nameBn: string };
  brand: { id: string; slug: string; name: string };
}) {
  return {
    ...row.product,
    ratingAvg: Number(row.product.ratingAvg),
    category: row.category,
    brand: row.brand,
  };
}

export async function saveProduct(db: DB, productId: string, userId: string) {
  const [prod] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!prod) throw notFound("PRODUCT_NOT_FOUND", "Product not found");

  await db
    .insert(savedProducts)
    .values({ productId, userId })
    .onConflictDoNothing();
  return { saved: true };
}

export async function unsaveProduct(db: DB, productId: string, userId: string) {
  await db
    .delete(savedProducts)
    .where(and(eq(savedProducts.productId, productId), eq(savedProducts.userId, userId)));
  return { saved: false };
}

export async function listSavedIds(db: DB, userId: string) {
  const rows = await db
    .select({ productId: savedProducts.productId })
    .from(savedProducts)
    .where(eq(savedProducts.userId, userId));
  return { ids: rows.map((r) => r.productId) };
}

export async function listSaved(db: DB, userId: string, page: PageParams) {
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        savedAt: savedProducts.createdAt,
        product: getTableColumns(products),
        category: categoryRef,
        brand: brandRef,
      })
      .from(savedProducts)
      .innerJoin(products, eq(savedProducts.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(eq(savedProducts.userId, userId))
      .orderBy(desc(savedProducts.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(savedProducts)
      .where(eq(savedProducts.userId, userId)),
  ]);

  return paginated(
    rows.map((r) => ({ savedAt: r.savedAt, product: mapProduct(r) })),
    countRow?.n ?? 0,
    page,
  );
}
