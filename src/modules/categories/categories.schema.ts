import { z } from "zod";

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens only");

export const categoryOut = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  nameEn: z.string(),
  nameBn: z.string(),
  icon: z.string().nullable(),
  parentId: z.string().uuid().nullable(),
  createdAt: z.date(),
  productCount: z.number().int().optional(),
});
export type CategoryOut = z.infer<typeof categoryOut>;

export const createCategoryBody = z.object({
  slug,
  nameEn: z.string().min(1).max(120),
  nameBn: z.string().min(1).max(120),
  icon: z.string().max(120).optional(),
  parentId: z.string().uuid().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategoryBody>;

export const updateCategoryBody = createCategoryBody.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategoryBody>;

export const categoryParams = z.object({ id: z.string().uuid() });
