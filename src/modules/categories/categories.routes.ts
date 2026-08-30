import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import {
  categoryOut,
  categoryParams,
  createCategoryBody,
  updateCategoryBody,
} from "./categories.schema";
import * as svc from "./categories.service";

/**
 * Mounted at /api/v1/categories.
 *   GET    /            public   list
 *   GET    /:id         public   one
 *   POST   /            admin    create
 *   PATCH  /:id         admin    update
 *   DELETE /:id         admin    delete
 */
export async function categoriesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    { schema: { response: { 200: z.array(categoryOut) } } },
    async () => svc.listCategories(db),
  );

  r.get(
    "/:id",
    { schema: { params: categoryParams, response: { 200: categoryOut } } },
    async (req) => svc.getCategory(db, req.params.id),
  );

  r.post(
    "/",
    {
      onRequest: app.requireRole("admin"),
      schema: { body: createCategoryBody, response: { 201: categoryOut } },
    },
    async (req, reply) => {
      const row = await svc.createCategory(db, req.body);
      return reply.status(201).send(row);
    },
  );

  r.patch(
    "/:id",
    {
      onRequest: app.requireRole("admin"),
      schema: { params: categoryParams, body: updateCategoryBody, response: { 200: categoryOut } },
    },
    async (req) => svc.updateCategory(db, req.params.id, req.body),
  );

  r.delete(
    "/:id",
    { onRequest: app.requireRole("admin"), schema: { params: categoryParams } },
    async (req, reply) => {
      await svc.deleteCategory(db, req.params.id);
      return reply.status(204).send();
    },
  );
}
