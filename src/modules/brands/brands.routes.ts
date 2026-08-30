import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { brandOut, brandParams, createBrandBody, updateBrandBody } from "./brands.schema";
import * as svc from "./brands.service";

/** Mounted at /api/v1/brands. */
export async function brandsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/", { schema: { response: { 200: z.array(brandOut) } } }, async () =>
    svc.listBrands(db),
  );

  r.get(
    "/:id",
    { schema: { params: brandParams, response: { 200: brandOut } } },
    async (req) => svc.getBrand(db, req.params.id),
  );

  r.post(
    "/",
    {
      onRequest: app.requireRole("admin"),
      schema: { body: createBrandBody, response: { 201: brandOut } },
    },
    async (req, reply) => reply.status(201).send(await svc.createBrand(db, req.body)),
  );

  r.patch(
    "/:id",
    {
      onRequest: app.requireRole("admin"),
      schema: { params: brandParams, body: updateBrandBody, response: { 200: brandOut } },
    },
    async (req) => svc.updateBrand(db, req.params.id, req.body),
  );

  r.delete(
    "/:id",
    { onRequest: app.requireRole("admin"), schema: { params: brandParams } },
    async (req, reply) => {
      await svc.deleteBrand(db, req.params.id);
      return reply.status(204).send();
    },
  );
}
