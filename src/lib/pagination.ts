import { z } from "zod";

/** Query fragment for offset pagination. Spread into a route's query schema. */
export const paginationQuery = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
};

export type PageParams = { limit: number; offset: number };

export function paginated<T>(data: T[], total: number, page: PageParams) {
  return { data, total, limit: page.limit, offset: page.offset };
}

/** Response schema builder: paginatedOut(itemSchema). */
export function paginatedOut<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  });
}
