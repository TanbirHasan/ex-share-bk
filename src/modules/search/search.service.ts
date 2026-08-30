import { desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { brands, categories, products, searchQueries } from "../../db/schema";

const categoryRef = {
  id: categories.id,
  slug: categories.slug,
  nameEn: categories.nameEn,
  nameBn: categories.nameBn,
};
const brandRef = { id: brands.id, slug: brands.slug, name: brands.name };

type Row = {
  product: typeof products.$inferSelect;
  category: { id: string; slug: string; nameEn: string; nameBn: string };
  brand: { id: string; slug: string; name: string };
};

function toProductOut(row: Row) {
  return {
    ...row.product,
    ratingAvg: Number(row.product.ratingAvg),
    category: row.category,
    brand: row.brand,
  };
}

/**
 * Relevance ranking (lower = better):
 *   0 exact name · 1 name prefix · 2 name contains · 3 matched elsewhere
 */
function nameRank(q: string) {
  return sql`case
    when lower(${products.name}) = lower(${q}) then 0
    when lower(${products.name}) like lower(${q + "%"}) then 1
    when lower(${products.name}) like lower(${"%" + q + "%"}) then 2
    else 3 end`;
}

export async function search(db: DB, q: string, limit: number) {
  const like = `%${q}%`;

  const productRows = await db
    .select({ product: getTableColumns(products), category: categoryRef, brand: brandRef })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(brands, eq(products.brandId, brands.id))
    .where(
      or(
        ilike(products.name, like),
        ilike(products.modelNo, like),
        ilike(products.slug, like),
        ilike(brands.name, like),
        ilike(categories.nameEn, like),
        ilike(categories.nameBn, like),
      ),
    )
    .orderBy(nameRank(q), desc(products.ratingCount), desc(products.createdAt))
    .limit(limit);

  const brandRows = await db
    .select({ id: brands.id, slug: brands.slug, name: brands.name, logoUrl: brands.logoUrl })
    .from(brands)
    .where(ilike(brands.name, like))
    .orderBy(brands.name)
    .limit(6);

  const categoryRows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      nameEn: categories.nameEn,
      nameBn: categories.nameBn,
    })
    .from(categories)
    .where(
      or(
        ilike(categories.nameEn, like),
        ilike(categories.nameBn, like),
        ilike(categories.slug, like),
      ),
    )
    .limit(6);

  const productsOut = productRows.map(toProductOut);
  const total = productsOut.length + brandRows.length + categoryRows.length;

  try {
    await db.insert(searchQueries).values({ query: q, resultsCount: total });
  } catch {
    // logging must never break search
  }

  return { query: q, total, products: productsOut, brands: brandRows, categories: categoryRows };
}

export async function suggest(db: DB, q: string) {
  const like = `%${q}%`;

  const productRows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      primaryImage: products.primaryImage,
      brandName: brands.name,
    })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .where(
      or(
        ilike(products.name, like),
        ilike(products.modelNo, like),
        ilike(products.slug, like),
      ),
    )
    .orderBy(nameRank(q), desc(products.ratingCount))
    .limit(6);

  const brandRows = await db
    .select({ slug: brands.slug, name: brands.name })
    .from(brands)
    .where(ilike(brands.name, like))
    .orderBy(brands.name)
    .limit(3);

  return { products: productRows, brands: brandRows };
}
