import { z } from "zod";
import { paginatedOut, paginationQuery } from "../../lib/pagination";

export const commentTargetTypeEnum = z.enum(["review", "solution"]);

export const listCommentsQuery = z.object({
  targetType: commentTargetTypeEnum,
  targetId: z.string().uuid(),
  ...paginationQuery,
});

export const createCommentBody = z.object({
  targetType: commentTargetTypeEnum,
  targetId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
  contentLang: z.enum(["bn", "en"]).optional(),
});

export const commentIdParams = z.object({ id: z.string().uuid() });

export const commentOut = z.object({
  id: z.string().uuid(),
  targetType: commentTargetTypeEnum,
  targetId: z.string().uuid(),
  body: z.string(),
  contentLang: z.enum(["bn", "en"]),
  createdAt: z.date(),
  author: z.object({
    id: z.string().uuid(),
    name: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    reputation: z.number().int(),
  }),
  viewerCanEdit: z.boolean(),
});

export const listCommentsOut = paginatedOut(commentOut);
