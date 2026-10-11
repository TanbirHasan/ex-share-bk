import { z } from "zod";
import { createProblemBody } from "../problems/problems.schema";
import { createReviewBody } from "../reviews/reviews.schema";
import { createServiceBody } from "../service/service.schema";

// Optional "I own this, here's my experience" draft attached to a request —
// converted into a real row once an admin fulfills it with a productId.
export const requestContentBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("review"), payload: createReviewBody }),
  z.object({ type: z.literal("problem"), payload: createProblemBody }),
  z.object({ type: z.literal("service"), payload: createServiceBody }),
]);
export type RequestContent = z.infer<typeof requestContentBody>;

export const createRequestBody = z.object({
  rawText: z.string().trim().min(3).max(500),
  categoryGuess: z.string().trim().max(120).optional(),
  content: requestContentBody.optional(),
});

export const fulfillRequestBody = z.object({
  productId: z.string().uuid(),
});

export const listRequestsQuery = z.object({
  status: z.enum(["open", "added", "rejected"]).default("open"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// "added" is only reachable via POST .../fulfill now, so status and
// productId can never go out of sync — this route only ever rejects.
export const updateRequestBody = z.object({
  status: z.literal("rejected"),
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
  contentType: z.enum(["review", "problem", "service"]).nullable(),
  contentPreview: z.string().nullable(),
});

export const listRequestsOut = z.object({
  data: z.array(requestOut),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
