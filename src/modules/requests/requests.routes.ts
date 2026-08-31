import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import {
  createRequestBody,
  listRequestsOut,
  listRequestsQuery,
  requestIdParams,
  updateRequestBody,
} from "./requests.schema";
import * as svc from "./requests.service";

/** Mounted at /api/v1. "I can't find this product" requests + the admin queue. */
export async function requestsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Any signed-in user can ask for a product we don't stock yet.
  r.post(
    "/product-requests",
    {
      onRequest: app.authenticate,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 hour",
          errorResponseBuilder: () => ({
            error: {
              code: "REQUEST_RATE_LIMITED",
              message: "That's a lot of requests. Try again a bit later.",
            },
          }),
        },
      },
      schema: {
        body: createRequestBody,
        response: {
          200: z.object({ ok: z.boolean(), duplicate: z.boolean() }),
        },
      },
    },
    async (req) => svc.createRequest(db, req.authUser!.id, req.body),
  );

  // Admin queue.
  r.get(
    "/admin/product-requests",
    {
      onRequest: app.requireRole("admin"),
      schema: { querystring: listRequestsQuery, response: { 200: listRequestsOut } },
    },
    async (req) =>
      svc.listRequests(db, req.query.status, {
        limit: req.query.limit,
        offset: req.query.offset,
      }),
  );

  r.patch(
    "/admin/product-requests/:id",
    {
      onRequest: app.requireRole("admin"),
      schema: {
        params: requestIdParams,
        body: updateRequestBody,
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (req) => svc.updateRequest(db, req.params.id, req.body.status),
  );
}
