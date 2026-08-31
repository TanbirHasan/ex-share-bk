import { z } from "zod";

export const createRequestBody = z.object({
  rawText: z.string().trim().min(3).max(500),
  categoryGuess: z.string().trim().max(120).optional(),
});

export const listRequestsQuery = z.object({
  status: z.enum(["open", "added", "rejected"]).default("open"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const updateRequestBody = z.object({
  status: z.enum(["added", "rejected"]),
});

export const requestIdParams = z.object({ id: z.string().uuid() });

export const requestOut = z.object({
  id: z.string().uuid(),
  rawText: z.string(),
  categoryGuess: z.string().nullable(),
  status: z.enum(["open", "added", "rejected"]),
  createdAt: z.date(),
  requester: z
    .object({ id: z.string().uuid(), name: z.string().nullable() })
    .nullable(),
});

export const listRequestsOut = z.object({
  data: z.array(requestOut),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
