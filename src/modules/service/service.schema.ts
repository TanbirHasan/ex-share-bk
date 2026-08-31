import { z } from "zod";
import { paginationQuery } from "../../lib/pagination";

export const responseTimeEnum = z.enum([
  "same_day",
  "within_3_days",
  "within_a_week",
  "over_a_week",
  "no_response",
]);
export const channelEnum = z.enum([
  "phone",
  "email",
  "service_center",
  "home_visit",
  "social_media",
  "other",
]);
export const repairOutcomeEnum = z.enum([
  "fixed",
  "partly_fixed",
  "not_fixed",
  "replaced",
  "refunded",
  "pending",
]);
export const warrantyEnum = z.enum(["yes", "no", "partial", "unsure"]);

export const createServiceBody = z.object({
  rating: z.number().int().min(1).max(5),
  responseTime: responseTimeEnum,
  channel: channelEnum,
  repairOutcome: repairOutcomeEnum,
  warranty: warrantyEnum,
  technicianRating: z.number().int().min(1).max(5).optional(),
  issue: z.string().trim().max(200).optional(),
  cost: z.number().int().min(0).max(100_000_000).optional(),
  durationDays: z.number().int().min(0).max(3650).optional(),
  comment: z.string().trim().max(4000).optional(),
  contentLang: z.enum(["bn", "en"]).optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceBody>;

export const updateServiceBody = createServiceBody.partial();
export type UpdateServiceInput = z.infer<typeof updateServiceBody>;

export const listServiceQuery = z.object({
  sort: z.enum(["recent", "rating"]).default("recent"),
  ...paginationQuery,
});
export type ListServiceQuery = z.infer<typeof listServiceQuery>;

const author = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const serviceOut = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  rating: z.number().int(),
  responseTime: responseTimeEnum,
  channel: channelEnum,
  repairOutcome: repairOutcomeEnum,
  warranty: warrantyEnum,
  technicianRating: z.number().int().nullable(),
  issue: z.string().nullable(),
  cost: z.number().int().nullable(),
  durationDays: z.number().int().nullable(),
  comment: z.string().nullable(),
  contentLang: z.enum(["bn", "en"]),
  status: z.enum(["pending", "approved", "rejected"]),
  createdAt: z.date(),
  updatedAt: z.date(),
  author,
  viewerCanEdit: z.boolean(),
});

export const serviceSummary = z.object({
  count: z.number().int(),
  avgRating: z.number(),
  avgTechnicianRating: z.number().nullable(),
  recommendedRate: z.number(),
  responseTime: z.record(z.number()),
  repairOutcome: z.record(z.number()),
  warranty: z.record(z.number()),
  medianCost: z.number().nullable(),
  medianDurationDays: z.number().nullable(),
});

export const listServiceOut = z.object({
  data: z.array(serviceOut),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  summary: serviceSummary,
});

const productRef = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  primaryImage: z.string().nullable(),
});

export const myServiceOut = z.object({
  data: z.array(serviceOut.extend({ product: productRef })),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const serviceIdParams = z.object({ id: z.string().uuid() });
export const productServiceParams = z.object({ productId: z.string().uuid() });
