import { z } from "zod";
import { productOut } from "../products/products.schema";

export const priorityEnum = z.enum([
  "balanced",
  "reliability",
  "price",
  "performance",
  "after_sales",
]);
export type Priority = z.infer<typeof priorityEnum>;

export const recommendQuery = z.object({
  category: z.string().min(1).max(120),
  budgetMax: z.coerce.number().int().min(0).max(100_000_000).optional(),
  priority: priorityEnum.default("balanced"),
});

export const recommendResultOut = z.object({
  product: productOut,
  score: z.number().int(),
  reasons: z.array(z.string()),
  problemCount: z.number().int(),
  serviceRating: z.number().nullable(),
});

export const recommendOut = z.object({
  category: z
    .object({ slug: z.string(), nameEn: z.string(), nameBn: z.string() })
    .nullable(),
  budgetMax: z.number().int().nullable(),
  priority: priorityEnum,
  results: z.array(recommendResultOut),
});
