import { z } from "zod";

export const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const activityItem = z.object({
  type: z.enum(["review", "problem", "solution"]),
  id: z.string().uuid(),
  createdAt: z.date(),
  actor: z
    .object({
      id: z.string().uuid(),
      name: z.string().nullable(),
      avatarUrl: z.string().nullable(),
    })
    .nullable(),
  product: z.object({ slug: z.string(), name: z.string() }),
  headline: z.string(),
  snippet: z.string(),
  href: z.string(),
});

export const activityOut = z.array(activityItem);
