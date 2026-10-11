import { z } from "zod";

export const productLookupBody = z.object({
  query: z.string().trim().min(3).max(200),
});
export type ProductLookupBody = z.infer<typeof productLookupBody>;

export const productLookupOut = z.object({
  name: z.string().optional(),
  brand: z.string().optional(),
  modelNo: z.string().optional(),
  category: z.string().optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  warrantyText: z.string().optional(),
  specs: z.record(z.string(), z.string()).optional(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});
