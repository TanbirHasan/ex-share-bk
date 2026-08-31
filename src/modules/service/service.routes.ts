import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { paginationQuery } from "../../lib/pagination";
import {
  createServiceBody,
  listServiceOut,
  listServiceQuery,
  myServiceOut,
  productServiceParams,
  serviceIdParams,
  serviceOut,
  updateServiceBody,
} from "./service.schema";
import * as svc from "./service.service";

const privileged = (role: string) => role === "admin" || role === "moderator";

/** Mounted at /api/v1. */
export async function serviceRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/products/:productId/service",
    {
      onRequest: app.optionalAuthenticate,
      schema: {
        params: productServiceParams,
        querystring: listServiceQuery,
        response: { 200: listServiceOut },
      },
    },
    async (req) =>
      svc.listServiceExperiences(db, req.params.productId, req.query, req.authUser?.id),
  );

  r.post(
    "/products/:productId/service",
    {
      onRequest: app.authenticate,
      schema: {
        params: productServiceParams,
        body: createServiceBody,
        response: { 201: serviceOut },
      },
    },
    async (req, reply) => {
      const row = await svc.createServiceExperience(
        db,
        req.params.productId,
        req.authUser!.id,
        req.body,
      );
      return reply.status(201).send(row);
    },
  );

  r.get(
    "/products/:productId/service/mine",
    {
      onRequest: app.authenticate,
      schema: { params: productServiceParams, response: { 200: serviceOut.nullable() } },
    },
    async (req) => svc.getMyServiceExperience(db, req.params.productId, req.authUser!.id),
  );

  r.patch(
    "/service/:id",
    {
      onRequest: app.authenticate,
      schema: { params: serviceIdParams, body: updateServiceBody, response: { 200: serviceOut } },
    },
    async (req) =>
      svc.updateServiceExperience(
        db,
        req.params.id,
        req.authUser!.id,
        privileged(req.authUser!.role),
        req.body,
      ),
  );

  r.delete(
    "/service/:id",
    { onRequest: app.authenticate, schema: { params: serviceIdParams } },
    async (req, reply) => {
      await svc.deleteServiceExperience(
        db,
        req.params.id,
        req.authUser!.id,
        privileged(req.authUser!.role),
      );
      return reply.status(204).send();
    },
  );

  r.get(
    "/me/service",
    {
      onRequest: app.authenticate,
      schema: { querystring: z.object(paginationQuery), response: { 200: myServiceOut } },
    },
    async (req) =>
      svc.listMyServiceExperiences(db, req.authUser!.id, {
        limit: req.query.limit,
        offset: req.query.offset,
      }),
  );
}
