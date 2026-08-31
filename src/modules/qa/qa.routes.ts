import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { paginationQuery } from "../../lib/pagination";
import {
  acceptBody,
  answerIdParams,
  createAnswerBody,
  createQuestionBody,
  listQuestionsOut,
  listQuestionsQuery,
  myQuestionsOut,
  productQuestionsParams,
  questionIdParams,
  questionOut,
} from "./qa.schema";
import * as svc from "./qa.service";

const privileged = (role: string) => role === "admin" || role === "moderator";

/** Mounted at /api/v1. */
export async function qaRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/products/:productId/questions",
    {
      onRequest: app.optionalAuthenticate,
      schema: {
        params: productQuestionsParams,
        querystring: listQuestionsQuery,
        response: { 200: listQuestionsOut },
      },
    },
    async (req) =>
      svc.listQuestions(
        db,
        req.params.productId,
        { limit: req.query.limit, offset: req.query.offset },
        req.authUser?.id,
      ),
  );

  r.post(
    "/products/:productId/questions",
    {
      onRequest: app.authenticate,
      schema: {
        params: productQuestionsParams,
        body: createQuestionBody,
        response: { 201: questionOut },
      },
    },
    async (req, reply) => {
      const q = await svc.createQuestion(db, req.params.productId, req.authUser!.id, req.body.body);
      return reply.status(201).send(q);
    },
  );

  r.delete(
    "/questions/:id",
    { onRequest: app.authenticate, schema: { params: questionIdParams } },
    async (req, reply) => {
      await svc.deleteQuestion(db, req.params.id, req.authUser!.id, privileged(req.authUser!.role));
      return reply.status(204).send();
    },
  );

  r.post(
    "/questions/:id/answers",
    {
      onRequest: app.authenticate,
      schema: { params: questionIdParams, body: createAnswerBody, response: { 200: questionOut } },
    },
    async (req) => svc.createAnswer(db, req.params.id, req.authUser!.id, req.body.body),
  );

  r.post(
    "/questions/:id/accept",
    {
      onRequest: app.authenticate,
      schema: { params: questionIdParams, body: acceptBody, response: { 200: questionOut } },
    },
    async (req) => svc.acceptAnswer(db, req.params.id, req.authUser!.id, req.body.answerId),
  );

  r.delete(
    "/answers/:id",
    {
      onRequest: app.authenticate,
      schema: { params: answerIdParams, response: { 200: questionOut } },
    },
    async (req) =>
      svc.deleteAnswer(db, req.params.id, req.authUser!.id, privileged(req.authUser!.role)),
  );

  r.get(
    "/me/questions",
    {
      onRequest: app.authenticate,
      schema: { querystring: z.object(paginationQuery), response: { 200: myQuestionsOut } },
    },
    async (req) =>
      svc.listMyQuestions(db, req.authUser!.id, {
        limit: req.query.limit,
        offset: req.query.offset,
      }),
  );
}
