import { z } from "zod";
import { paginatedOut, paginationQuery } from "../../lib/pagination";

const slug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens only");

const productStatusEnum = z.enum(["new", "active", "older", "discontinued"]);

export const productImageOut = z.object({
  id: z.string().uuid(),
  url: z.string(),
  sort: z.number().int(),
});

export const productCategoryRef = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  nameEn: z.string(),
  nameBn: z.string(),
});

export const productBrandRef = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
});

export const productOut = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid(),
  category: productCategoryRef,
  brand: productBrandRef,
  name: z.string(),
  modelNo: z.string().nullable(),
  status: productStatusEnum,
  priceMin: z.number().int().nullable(),
  priceMax: z.number().int().nullable(),
  warrantyText: z.string().nullable(),
  spec: z.record(z.unknown()),
  primaryImage: z.string().nullable(),
  ratingAvg: z.coerce.number(),
  ratingCount: z.number().int(),
  wouldBuyAgainPct: z.number().int(),
  categoryRatingAvgs: z.record(z.number()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const productWithImagesOut = productOut.extend({
  images: z.array(productImageOut),
  problemCount: z.number().int(),
});

export const productSort = z.enum(["newest", "trending", "top_rated"]);

export const listProductsQuery = z.object({
  q: z.string().max(120).optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  categorySlug: z.string().max(120).optional(),
  brandSlug: z.string().max(120).optional(),
  status: productStatusEnum.optional(),
  sort: productSort.optional(),
  ...paginationQuery,
});
export type ListProductsQuery = z.infer<typeof listProductsQuery>;

export const productSlugParams = z.object({ slug: z.string().min(1).max(140) });

export const listProductsOut = paginatedOut(productOut);

const priceRange = {
  priceMin: z.number().int().min(0).optional(),
  priceMax: z.number().int().min(0).optional(),
};

export const createProductBody = z
  .object({
    slug,
    categoryId: z.string().uuid(),
    brandId: z.string().uuid(),
    name: z.string().min(1).max(200),
    modelNo: z.string().max(120).optional(),
    status: productStatusEnum.optional(),
    ...priceRange,
    warrantyText: z.string().max(1000).optional(),
    spec: z.record(z.unknown()).optional(),
    primaryImage: z.string().url().max(2048).optional(),
  })
  .refine(
    (v) => v.priceMin == null || v.priceMax == null || v.priceMin <= v.priceMax,
    { message: "priceMin must be <= priceMax", path: ["priceMin"] },
  );
export type CreateProductInput = z.infer<typeof createProductBody>;

export const updateProductBody = z
  .object({
    slug: slug.optional(),
    categoryId: z.string().uuid().optional(),
    brandId: z.string().uuid().optional(),
    name: z.string().min(1).max(200).optional(),
    modelNo: z.string().max(120).nullable().optional(),
    status: productStatusEnum.optional(),
    priceMin: z.number().int().min(0).nullable().optional(),
    priceMax: z.number().int().min(0).nullable().optional(),
    warrantyText: z.string().max(1000).nullable().optional(),
    spec: z.record(z.unknown()).optional(),
    primaryImage: z.string().url().max(2048).nullable().optional(),
  })
  .refine(
    (v) =>
      v.priceMin == null || v.priceMax == null || v.priceMin <= v.priceMax,
    { message: "priceMin must be <= priceMax", path: ["priceMin"] },
  );
export type UpdateProductInput = z.infer<typeof updateProductBody>;

export const productParams = z.object({ id: z.string().uuid() });
export const productImageParams = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
});

export const addImageBody = z.object({
  url: z.string().url().max(2048),
  sort: z.number().int().min(0).optional(),
});
