import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../db/client";
import {
  listSavedQuery,
  productSaveParams,
  savedIdsOut,
  savedListOut,
  savedStateOut,
} from "./saved.schema";
import * as svc from "./saved.service";

/** Mounted at /api/v1. */
export async function savedRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/products/:productId/save",
    {
      onRequest: app.authenticate,
      schema: { params: productSaveParams, response: { 200: savedStateOut } },
    },
    async (req) => svc.saveProduct(db, req.params.productId, req.authUser!.id),
  );

  r.delete(
    "/products/:productId/save",
    {
      onRequest: app.authenticate,
      schema: { params: productSaveParams, response: { 200: savedStateOut } },
    },
    async (req) => svc.unsaveProduct(db, req.params.productId, req.authUser!.id),
  );

  r.get(
    "/me/saved-ids",
    { onRequest: app.authenticate, schema: { response: { 200: savedIdsOut } } },
    async (req) => svc.listSavedIds(db, req.authUser!.id),
  );

  r.get(
    "/me/saved",
    {
      onRequest: app.authenticate,
      schema: { querystring: listSavedQuery, response: { 200: savedListOut } },
    },
    async (req) =>
      svc.listSaved(db, req.authUser!.id, {
        limit: req.query.limit,
        offset: req.query.offset,
      }),
  );
}
