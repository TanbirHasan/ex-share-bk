import { z } from "zod";
import { paginatedOut, paginationQuery } from "../../lib/pagination";
import { productOut } from "../products/products.schema";

export const productSaveParams = z.object({ productId: z.string().uuid() });

export const savedStateOut = z.object({ saved: z.boolean() });

export const savedIdsOut = z.object({ ids: z.array(z.string().uuid()) });

export const savedItemOut = z.object({
  savedAt: z.date(),
  product: productOut,
});

export const savedListOut = paginatedOut(savedItemOut);

export const listSavedQuery = z.object(paginationQuery);
