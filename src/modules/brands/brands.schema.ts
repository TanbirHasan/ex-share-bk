import { z } from "zod";

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens only");

export const brandOut = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  aboutEn: z.string().nullable(),
  aboutBn: z.string().nullable(),
  createdAt: z.date(),
  productCount: z.number().int().optional(),
});

export const createBrandBody = z.object({
  slug,
  name: z.string().min(1).max(120),
  logoUrl: z.string().url().max(2048).optional(),
  aboutEn: z.string().max(2000).optional(),
  aboutBn: z.string().max(2000).optional(),
});
export type CreateBrandInput = z.infer<typeof createBrandBody>;

export const updateBrandBody = createBrandBody.partial();
export type UpdateBrandInput = z.infer<typeof updateBrandBody>;

export const brandParams = z.object({ id: z.string().uuid() });
