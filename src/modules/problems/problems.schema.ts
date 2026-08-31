import { z } from "zod";
import { paginatedOut, paginationQuery } from "../../lib/pagination";

export const problemCategoryEnum = z.enum([
  "cooling",
  "noise",
  "display",
  "power",
  "software",
  "build_quality",
  "connectivity",
  "battery",
  "performance",
  "after_sales",
  "other",
]);

export const problemStartedEnum = z.enum([
  "out_of_box",
  "lt_3m",
  "m3_6",
  "m6_12",
  "y1_2",
  "y2_3",
  "gt_3y",
]);

export const warrantyCoveredEnum = z.enum(["yes", "no", "partial"]);

const reportInput = z.object({
  whenStarted: problemStartedEnum.optional(),
  repairCost: z.number().int().min(0).max(100_000_000).optional(),
  warrantyCovered: warrantyCoveredEnum.optional(),
  note: z.string().trim().max(2000).optional(),
});

export const createProblemBody = z.object({
  category: problemCategoryEnum,
  title: z.string().trim().min(6).max(160),
  description: z.string().trim().min(10).max(4000),
  contentLang: z.enum(["bn", "en"]).optional(),
  report: reportInput.optional(),
});
export type CreateProblemInput = z.infer<typeof createProblemBody>;

export const addReportBody = reportInput;
export type AddReportInput = z.infer<typeof addReportBody>;

export const createSolutionBody = z.object({
  body: z.string().trim().min(10).max(4000),
  contentLang: z.enum(["bn", "en"]).optional(),
});
export type CreateSolutionInput = z.infer<typeof createSolutionBody>;

export const updateSolutionBody = createSolutionBody.partial();
export const confirmBody = z.object({ worked: z.boolean() });

export const listProblemsQuery = z.object({
  q: z.string().max(120).optional(),
  category: problemCategoryEnum.optional(),
  productId: z.string().uuid().optional(),
  sort: z.enum(["recent", "reported"]).default("reported"),
  ...paginationQuery,
});
export type ListProblemsQuery = z.infer<typeof listProblemsQuery>;

export const productProblemsParams = z.object({ productId: z.string().uuid() });
export const problemIdParams = z.object({ id: z.string().uuid() });
export const problemSlugParams = z.object({ slug: z.string().min(1).max(180) });
export const solutionIdParams = z.object({ id: z.string().uuid() });

// --- outputs -----------------------------------------------------------------

const productRef = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  primaryImage: z.string().nullable(),
});

const person = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

const solutionAuthor = person.extend({ reputation: z.number().int() });

export const problemListItem = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  category: problemCategoryEnum,
  title: z.string(),
  description: z.string(),
  reportCount: z.number().int(),
  solutionCount: z.number().int(),
  createdAt: z.date(),
  product: productRef,
});
export const listProblemsOut = paginatedOut(problemListItem);

export const solutionOut = z.object({
  id: z.string().uuid(),
  problemId: z.string().uuid(),
  body: z.string(),
  contentLang: z.enum(["bn", "en"]),
  workedCount: z.number().int(),
  didntWorkCount: z.number().int(),
  helpfulCount: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
  author: solutionAuthor,
  viewerConfirmed: z.enum(["worked", "didnt", "none"]),
  viewerHasVoted: z.boolean(),
  viewerCanEdit: z.boolean(),
});

export const problemDetailOut = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  category: problemCategoryEnum,
  title: z.string(),
  description: z.string(),
  contentLang: z.enum(["bn", "en"]),
  reportCount: z.number().int(),
  createdAt: z.date(),
  product: productRef,
  reporter: person.nullable(),
  viewerHasReported: z.boolean(),
  whenStarted: z.record(z.number()),
  warrantyBreakdown: z.record(z.number()),
  repairCost: z
    .object({
      min: z.number(),
      max: z.number(),
      median: z.number(),
      count: z.number(),
    })
    .nullable(),
  solutions: z.array(solutionOut),
});

export const myProblemsOut = paginatedOut(
  problemListItem.extend({ viewerIsCreator: z.boolean() }),
);

export const mySolutionsOut = paginatedOut(
  solutionOut.extend({
    problem: z.object({
      id: z.string().uuid(),
      slug: z.string(),
      title: z.string(),
    }),
    product: productRef,
  }),
);
