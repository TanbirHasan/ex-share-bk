import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../db/client";
import {
  commentIdParams,
  commentOut,
  createCommentBody,
  listCommentsOut,
  listCommentsQuery,
} from "./comments.schema";
import * as svc from "./comments.service";

const privileged = (role: string) => role === "admin" || role === "moderator";

/** Mounted at /api/v1. */
export async function commentsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/comments",
    {
      onRequest: app.optionalAuthenticate,
      schema: { querystring: listCommentsQuery, response: { 200: listCommentsOut } },
    },
    async (req) =>
      svc.listComments(
        db,
        req.query.targetType,
        req.query.targetId,
        { limit: req.query.limit, offset: req.query.offset },
        req.authUser?.id,
      ),
  );

  r.post(
    "/comments",
    {
      onRequest: app.authenticate,
      schema: { body: createCommentBody, response: { 201: commentOut } },
    },
    async (req, reply) => {
      const c = await svc.createComment(db, req.authUser!.id, req.body);
      return reply.status(201).send(c);
    },
  );

  r.delete(
    "/comments/:id",
    { onRequest: app.authenticate, schema: { params: commentIdParams } },
    async (req, reply) => {
      await svc.deleteComment(
        db,
        req.params.id,
        req.authUser!.id,
        privileged(req.authUser!.role),
      );
      return reply.status(204).send();
    },
  );
}
