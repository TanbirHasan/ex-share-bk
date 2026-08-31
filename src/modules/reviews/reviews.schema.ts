import { z } from "zod";
import { paginatedOut, paginationQuery } from "../../lib/pagination";

export const ownershipDurationEnum = z.enum([
  "lt_3m",
  "m3_6",
  "m6_12",
  "y1_2",
  "y2_3",
  "gt_3y",
]);

export const wouldBuyAgainEnum = z.enum(["yes", "maybe", "no"]);

const catRating = z.number().int().min(1).max(5);
export const categoryRatingsSchema = z
  .object({
    reliability: catRating.optional(),
    performance: catRating.optional(),
    value: catRating.optional(),
    after_sales: catRating.optional(),
  })
  .strict();

const tagList = z.array(z.string().trim().min(1).max(80)).max(8);

export const createReviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  ownershipDuration: ownershipDurationEnum,
  categoryRatings: categoryRatingsSchema.optional(),
  wouldBuyAgain: wouldBuyAgainEnum,
  comment: z.string().trim().max(4000).optional(),
  pros: tagList.optional(),
  cons: tagList.optional(),
  purchasePrice: z.number().int().min(0).max(100_000_000).optional(),
  purchaseStore: z.string().trim().max(120).optional(),
  contentLang: z.enum(["bn", "en"]).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewBody>;

export const updateReviewBody = createReviewBody.partial();
export type UpdateReviewInput = z.infer<typeof updateReviewBody>;

export const listReviewsQuery = z.object({
  ownershipDuration: ownershipDurationEnum.optional(),
  sort: z.enum(["recent", "helpful"]).default("recent"),
  ...paginationQuery,
});
export type ListReviewsQuery = z.infer<typeof listReviewsQuery>;

export const reviewAuthor = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  reputation: z.number().int(),
});

export const reviewOut = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  rating: z.number().int(),
  ownershipDuration: ownershipDurationEnum,
  categoryRatings: z.record(z.number()),
  wouldBuyAgain: wouldBuyAgainEnum,
  comment: z.string().nullable(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  purchasePrice: z.number().int().nullable(),
  purchaseStore: z.string().nullable(),
  store: z.object({ slug: z.string(), name: z.string() }).nullable(),
  contentLang: z.enum(["bn", "en"]),
  status: z.enum(["pending", "approved", "rejected"]),
  helpfulCount: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
  author: reviewAuthor,
  viewerHasVoted: z.boolean(),
  viewerCanEdit: z.boolean(),
});

export const listReviewsOut = paginatedOut(reviewOut);

export const myReviewOut = reviewOut.extend({
  product: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    primaryImage: z.string().nullable(),
  }),
});
export const myReviewsOut = paginatedOut(myReviewOut);

export const reviewParams = z.object({ id: z.string().uuid() });
export const productReviewParams = z.object({ productId: z.string().uuid() });
