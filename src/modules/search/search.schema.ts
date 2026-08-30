import { z } from "zod";
import { productOut } from "../products/products.schema";

export const searchQuery = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const suggestQuery = z.object({
  q: z.string().trim().min(1).max(80),
});

const brandHit = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
});

const categoryHit = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  nameEn: z.string(),
  nameBn: z.string(),
});

export const searchOut = z.object({
  query: z.string(),
  total: z.number().int(),
  products: z.array(productOut),
  brands: z.array(brandHit),
  categories: z.array(categoryHit),
});

export const suggestOut = z.object({
  products: z.array(
    z.object({
      id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      primaryImage: z.string().nullable(),
      brandName: z.string(),
    }),
  ),
  brands: z.array(z.object({ slug: z.string(), name: z.string() })),
});
