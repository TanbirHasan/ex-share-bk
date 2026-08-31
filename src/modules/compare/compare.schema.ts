import { z } from "zod";
import { productWithImagesOut } from "../products/products.schema";

export const compareQuery = z.object({
  slugs: z.string().min(1).max(800),
});

export const compareProductOut = productWithImagesOut.extend({
  problemCount: z.number().int(),
});

export const compareOut = z.object({
  products: z.array(compareProductOut),
});
