import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { badRequest } from "../../lib/errors";
import { paginationQuery } from "../../lib/pagination";
import { saveImage } from "../../lib/uploads";
import {
  createReviewBody,
  listReviewsOut,
  listReviewsQuery,
  myReviewsOut,
  productReviewParams,
  reviewOut,
  reviewParams,
  updateReviewBody,
} from "./reviews.schema";
import * as svc from "./reviews.service";

/**
 * Mounted at /api/v1.
 *   GET    /products/:productId/reviews          public (soft auth for viewer flags)
 *   POST   /products/:productId/reviews          auth
 *   GET    /products/:productId/reviews/mine     auth
 *   PATCH  /reviews/:id                          auth (owner or admin)
 *   DELETE /reviews/:id                          auth (owner or admin)
 *   POST   /reviews/:id/vote                     auth
 *   DELETE /reviews/:id/vote                     auth
 *   GET    /me/reviews                           auth
 */
export async function reviewsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/products/:productId/reviews",
    {
      onRequest: app.optionalAuthenticate,
      schema: {
        params: productReviewParams,
        querystring: listReviewsQuery,
        response: { 200: listReviewsOut },
      },
    },
    async (req) =>
      svc.listReviews(db, req.params.productId, req.query, req.authUser?.id),
  );

  r.post(
    "/products/:productId/reviews",
    {
      onRequest: app.authenticate,
      schema: {
        params: productReviewParams,
        body: createReviewBody,
        response: { 201: reviewOut },
      },
    },
    async (req, reply) => {
      const review = await svc.createReview(
        db,
        req.params.productId,
        req.authUser!.id,
        req.body,
      );
      return reply.status(201).send(review);
    },
  );

  r.get(
    "/products/:productId/reviews/mine",
    {
      onRequest: app.authenticate,
      schema: {
        params: productReviewParams,
        response: { 200: reviewOut.nullable() },
      },
    },
    async (req) => svc.getMyReview(db, req.params.productId, req.authUser!.id),
  );

  r.patch(
    "/reviews/:id",
    {
      onRequest: app.authenticate,
      schema: { params: reviewParams, body: updateReviewBody, response: { 200: reviewOut } },
    },
    async (req) =>
      svc.updateReview(
        db,
        req.params.id,
        req.authUser!.id,
        req.authUser!.role === "admin" || req.authUser!.role === "moderator",
        req.body,
      ),
  );

  r.delete(
    "/reviews/:id",
    { onRequest: app.authenticate, schema: { params: reviewParams } },
    async (req, reply) => {
      await svc.deleteReview(
        db,
        req.params.id,
        req.authUser!.id,
        req.authUser!.role === "admin" || req.authUser!.role === "moderator",
      );
      return reply.status(204).send();
    },
  );

  r.post(
    "/reviews/:id/vote",
    { onRequest: app.authenticate, schema: { params: reviewParams, response: { 200: reviewOut } } },
    async (req) => svc.voteHelpful(db, req.params.id, req.authUser!.id, true),
  );

  r.delete(
    "/reviews/:id/vote",
    { onRequest: app.authenticate, schema: { params: reviewParams, response: { 200: reviewOut } } },
    async (req) => svc.voteHelpful(db, req.params.id, req.authUser!.id, false),
  );

  r.post(
    "/reviews/:id/images/upload",
    {
      onRequest: app.authenticate,
      schema: { params: reviewParams, response: { 201: reviewOut } },
    },
    async (req, reply) => {
      const buf = req.body as Buffer | undefined;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        throw badRequest("NO_FILE", "Send the image as the raw request body.");
      }
      const saved = await saveImage(buf, req.headers["content-type"]);
      if (!saved) {
        throw badRequest("BAD_IMAGE", "Upload a JPG, PNG, WebP or GIF within the size limit.");
      }
      const review = await svc.addReviewImage(
        db,
        req.params.id,
        req.authUser!.id,
        req.authUser!.role === "admin" || req.authUser!.role === "moderator",
        saved.url,
      );
      return reply.status(201).send(review);
    },
  );

  r.delete(
    "/reviews/:id/images/:imageId",
    {
      onRequest: app.authenticate,
      schema: {
        params: reviewParams.extend({ imageId: z.string().uuid() }),
        response: { 200: reviewOut },
      },
    },
    async (req) =>
      svc.deleteReviewImage(
        db,
        req.params.id,
        req.params.imageId,
        req.authUser!.id,
        req.authUser!.role === "admin" || req.authUser!.role === "moderator",
      ),
  );

  r.get(
    "/me/reviews",
    {
      onRequest: app.authenticate,
      schema: { querystring: z.object(paginationQuery), response: { 200: myReviewsOut } },
    },
    async (req) =>
      svc.listMyReviews(db, req.authUser!.id, {
        limit: req.query.limit,
        offset: req.query.offset,
      }),
  );
}
