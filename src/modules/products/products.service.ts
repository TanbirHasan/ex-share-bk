import { and, asc, desc, eq, getTableColumns, ilike, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "../../db/client";
import { brands, categories, productImages, products } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { paginated, type PageParams } from "../../lib/pagination";
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "./products.schema";

const categoryRef = {
  id: categories.id,
  slug: categories.slug,
  nameEn: categories.nameEn,
  nameBn: categories.nameBn,
};
const brandRef = { id: brands.id, slug: brands.slug, name: brands.name };

type JoinedRow = {
  product: typeof products.$inferSelect;
  category: { id: string; slug: string; nameEn: string; nameBn: string };
  brand: { id: string; slug: string; name: string };
};

/** Map a joined row to the API shape (numeric column -> number, nested refs). */
function toOut(row: JoinedRow) {
  return {
    ...row.product,
    ratingAvg: Number(row.product.ratingAvg),
    category: row.category,
    brand: row.brand,
  };
}

function selectJoined(db: DB) {
  return db
    .select({ product: getTableColumns(products), category: categoryRef, brand: brandRef })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(brands, eq(products.brandId, brands.id));
}

async function assertRefsExist(db: DB, categoryId?: string, brandId?: string) {
  if (categoryId) {
    const [c] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);
    if (!c) throw badRequest("CATEGORY_NOT_FOUND", "categoryId does not exist");
  }
  if (brandId) {
    const [b] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.id, brandId))
      .limit(1);
    if (!b) throw badRequest("BRAND_NOT_FOUND", "brandId does not exist");
  }
}

async function assertSlugFree(db: DB, slug: string, exceptId?: string) {
  const [dup] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);
  if (dup && dup.id !== exceptId) {
    throw conflict("PRODUCT_SLUG_TAKEN", `Slug "${slug}" is already in use`);
  }
}

export async function listProducts(db: DB, query: ListProductsQuery) {
  const filters: SQL[] = [];
  if (query.categoryId) filters.push(eq(products.categoryId, query.categoryId));
  if (query.brandId) filters.push(eq(products.brandId, query.brandId));
  if (query.categorySlug) filters.push(eq(categories.slug, query.categorySlug));
  if (query.brandSlug) filters.push(eq(brands.slug, query.brandSlug));
  if (query.status) filters.push(eq(products.status, query.status));
  if (query.q) {
    const like = `%${query.q}%`;
    filters.push(
      or(
        ilike(products.name, like),
        ilike(products.modelNo, like),
        ilike(products.slug, like),
      )!,
    );
  }
  const where = filters.length ? and(...filters) : undefined;
  const page: PageParams = { limit: query.limit, offset: query.offset };

  const orderBy =
    query.sort === "trending"
      ? [desc(products.ratingCount), desc(products.createdAt)]
      : query.sort === "top_rated"
        ? [desc(products.ratingAvg), desc(products.ratingCount)]
        : [desc(products.createdAt)];

  const [rows, [countRow]] = await Promise.all([
    selectJoined(db).where(where).orderBy(...orderBy).limit(page.limit).offset(page.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(where),
  ]);

  return paginated(rows.map(toOut), countRow?.count ?? 0, page);
}

/** Other products in the same category, best-reviewed first. */
export async function getRelatedProducts(db: DB, id: string, limit: number) {
  const [self] = await db
    .select({ categoryId: products.categoryId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!self) throw notFound("PRODUCT_NOT_FOUND", "Product not found");

  const rows = await selectJoined(db)
    .where(and(eq(products.categoryId, self.categoryId), sql`${products.id} <> ${id}`))
    .orderBy(desc(products.ratingCount), desc(products.ratingAvg), desc(products.createdAt))
    .limit(limit);

  return rows.map(toOut);
}

async function withImages(db: DB, row: JoinedRow) {
  const images = await db
    .select({ id: productImages.id, url: productImages.url, sort: productImages.sort })
    .from(productImages)
    .where(eq(productImages.productId, row.product.id))
    .orderBy(asc(productImages.sort), asc(productImages.createdAt));
  return { ...toOut(row), images };
}

export async function getProduct(db: DB, id: string) {
  const [row] = await selectJoined(db).where(eq(products.id, id)).limit(1);
  if (!row) throw notFound("PRODUCT_NOT_FOUND", "Product not found");
  return withImages(db, row);
}

export async function getProductBySlug(db: DB, slug: string) {
  const [row] = await selectJoined(db).where(eq(products.slug, slug)).limit(1);
  if (!row) throw notFound("PRODUCT_NOT_FOUND", "Product not found");
  return withImages(db, row);
}

export async function createProduct(db: DB, input: CreateProductInput) {
  await assertRefsExist(db, input.categoryId, input.brandId);
  await assertSlugFree(db, input.slug);
  const [row] = await db
    .insert(products)
    .values({ ...input, spec: input.spec ?? {} })
    .returning({ id: products.id });
  return getProduct(db, row!.id);
}

export async function updateProduct(db: DB, id: string, input: UpdateProductInput) {
  if (Object.keys(input).length === 0) return getProduct(db, id);
  await assertRefsExist(db, input.categoryId, input.brandId);
  if (input.slug) await assertSlugFree(db, input.slug, id);

  const [row] = await db
    .update(products)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  if (!row) throw notFound("PRODUCT_NOT_FOUND", "Product not found");
  return getProduct(db, id);
}

export async function deleteProduct(db: DB, id: string) {
  const [row] = await db
    .delete(products)
    .where(eq(products.id, id))
    .returning({ id: products.id });
  if (!row) throw notFound("PRODUCT_NOT_FOUND", "Product not found");
}

export async function addProductImage(
  db: DB,
  productId: string,
  input: { url: string; sort?: number },
) {
  const [product] = await db
    .select({ id: products.id, primaryImage: products.primaryImage })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) throw notFound("PRODUCT_NOT_FOUND", "Product not found");

  const [image] = await db
    .insert(productImages)
    .values({ productId, url: input.url, sort: input.sort ?? 0 })
    .returning({ id: productImages.id, url: productImages.url, sort: productImages.sort });

  if (!product.primaryImage) {
    await db
      .update(products)
      .set({ primaryImage: input.url, updatedAt: new Date() })
      .where(eq(products.id, productId));
  }
  return image!;
}

export async function deleteProductImage(db: DB, productId: string, imageId: string) {
  const [deleted] = await db
    .delete(productImages)
    .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
    .returning({ url: productImages.url });
  if (!deleted) throw notFound("IMAGE_NOT_FOUND", "Image not found on this product");

  const [product] = await db
    .select({ primaryImage: products.primaryImage })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (product && product.primaryImage === deleted.url) {
    const [next] = await db
      .select({ url: productImages.url })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.sort), asc(productImages.createdAt))
      .limit(1);
    await db
      .update(products)
      .set({ primaryImage: next?.url ?? null, updatedAt: new Date() })
      .where(eq(products.id, productId));
  }
}
