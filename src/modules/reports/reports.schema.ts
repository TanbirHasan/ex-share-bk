import { z } from "zod";
import { paginatedOut, paginationQuery } from "../../lib/pagination";

export const reportTargetTypeEnum = z.enum(["review", "problem", "solution"]);
export const reportReasonEnum = z.enum([
  "spam",
  "fake",
  "offensive",
  "wrong_product",
  "duplicate",
  "other",
]);
export const reportStatusEnum = z.enum(["open", "reviewing", "actioned", "dismissed"]);
export const resolutionEnum = z.enum(["dismiss", "remove_content", "keep_content"]);

export const createReportBody = z.object({
  targetType: reportTargetTypeEnum,
  targetId: z.string().uuid(),
  reason: reportReasonEnum,
  detail: z.string().trim().max(1000).optional(),
});
export type CreateReportInput = z.infer<typeof createReportBody>;

export const listReportsQuery = z.object({
  status: reportStatusEnum.default("open"),
  ...paginationQuery,
});

export const resolveReportBody = z.object({ resolution: resolutionEnum });

export const reportOut = z.object({
  id: z.string().uuid(),
  targetType: reportTargetTypeEnum,
  targetId: z.string().uuid(),
  reason: z.string(),
  status: reportStatusEnum,
  createdAt: z.date(),
  reporter: z.object({ id: z.string().uuid(), name: z.string().nullable() }),
  reportCount: z.number().int(),
  target: z.object({
    exists: z.boolean(),
    snippet: z.string(),
    status: z.string().nullable(),
    authorName: z.string().nullable(),
    href: z.string().nullable(),
    productName: z.string().nullable(),
  }),
});

export const listReportsOut = paginatedOut(reportOut);

export const reportIdParams = z.object({ id: z.string().uuid() });
