import { z } from "zod";
import { paginatedOut, paginationQuery } from "../../lib/pagination";

export const createQuestionBody = z.object({
  body: z.string().trim().min(5).max(1000),
  contentLang: z.enum(["bn", "en"]).optional(),
});

export const createAnswerBody = z.object({
  body: z.string().trim().min(5).max(3000),
  contentLang: z.enum(["bn", "en"]).optional(),
});

export const acceptBody = z.object({ answerId: z.string().uuid().nullable() });

export const listQuestionsQuery = z.object(paginationQuery);
export const productQuestionsParams = z.object({ productId: z.string().uuid() });
export const questionIdParams = z.object({ id: z.string().uuid() });
export const answerIdParams = z.object({ id: z.string().uuid() });

const person = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  reputation: z.number().int(),
});

export const answerOut = z.object({
  id: z.string().uuid(),
  questionId: z.string().uuid(),
  body: z.string(),
  contentLang: z.enum(["bn", "en"]),
  createdAt: z.date(),
  author: person,
  isAccepted: z.boolean(),
  viewerCanEdit: z.boolean(),
});

export const questionOut = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  body: z.string(),
  contentLang: z.enum(["bn", "en"]),
  createdAt: z.date(),
  answerCount: z.number().int(),
  author: person,
  viewerCanEdit: z.boolean(),
  viewerIsAsker: z.boolean(),
  answers: z.array(answerOut),
});

export const listQuestionsOut = paginatedOut(questionOut);

export const myQuestionsOut = paginatedOut(
  questionOut.extend({
    product: z.object({
      id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      primaryImage: z.string().nullable(),
    }),
  }),
);
