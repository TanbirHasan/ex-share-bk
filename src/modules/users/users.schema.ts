import { z } from "zod";

export const userIdParams = z.object({ id: z.string().uuid() });

const badge = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
});

const recentReview = z.object({
  id: z.string().uuid(),
  rating: z.number().int(),
  comment: z.string().nullable(),
  createdAt: z.date(),
  product: z.object({ slug: z.string(), name: z.string() }),
});

const recentProblem = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  reportCount: z.number().int(),
  createdAt: z.date(),
  productName: z.string(),
});

const recentSolution = z.object({
  id: z.string().uuid(),
  body: z.string(),
  workedCount: z.number().int(),
  helpfulCount: z.number().int(),
  createdAt: z.date(),
  problem: z.object({ slug: z.string(), title: z.string() }),
});

export const profileOut = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
  staff: z.boolean(),
  counts: z.object({
    reviews: z.number().int(),
    problems: z.number().int(),
    solutions: z.number().int(),
    helpfulReceived: z.number().int(),
  }),
  score: z.number().int(),
  level: z.object({ key: z.string(), label: z.string() }),
  badges: z.array(badge),
  recent: z.object({
    reviews: z.array(recentReview),
    problems: z.array(recentProblem),
    solutions: z.array(recentSolution),
  }),
});
