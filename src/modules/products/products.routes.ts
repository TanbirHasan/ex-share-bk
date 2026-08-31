import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../db/client";
import { z } from "zod";
import {
  addImageBody,
  createProductBody,
  listProductsOut,
  listProductsQuery,
  productImageOut,
  productImageParams,
  productOut,
  productParams,
  productSlugParams,
  productWithImagesOut,
  updateProductBody,
} from "./products.schema";
import * as svc from "./products.service";

/**
 * Mounted at /api/v1/products.
 *   GET    /                     public   list (filters + pagination)
 *   GET    /:id                  public   one (with images)
 *   POST   /                     admin    create
 *   PATCH  /:id                  admin    update
 *   DELETE /:id                  admin    delete
 *   POST   /:id/images           admin    add image
 *   DELETE /:id/images/:imageId  admin    remove image
 */
export async function productsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    { schema: { querystring: listProductsQuery, response: { 200: listProductsOut } } },
    async (req) => svc.listProducts(db, req.query),
  );

  r.get(
    "/by-slug/:slug",
    { schema: { params: productSlugParams, response: { 200: productWithImagesOut } } },
    async (req) => svc.getProductBySlug(db, req.params.slug),
  );

  r.get(
    "/:id",
    { schema: { params: productParams, response: { 200: productWithImagesOut } } },
    async (req) => svc.getProduct(db, req.params.id),
  );

  r.get(
    "/:id/related",
    {
      schema: {
        params: productParams,
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(12).default(6) }),
        response: { 200: z.array(productOut) },
      },
    },
    async (req) => svc.getRelatedProducts(db, req.params.id, req.query.limit),
  );

  r.post(
    "/",
    {
      onRequest: app.requireRole("admin"),
      schema: { body: createProductBody, response: { 201: productWithImagesOut } },
    },
    async (req, reply) => reply.status(201).send(await svc.createProduct(db, req.body)),
  );

  r.patch(
    "/:id",
    {
      onRequest: app.requireRole("admin"),
      schema: {
        params: productParams,
        body: updateProductBody,
        response: { 200: productWithImagesOut },
      },
    },
    async (req) => svc.updateProduct(db, req.params.id, req.body),
  );

  r.delete(
    "/:id",
    { onRequest: app.requireRole("admin"), schema: { params: productParams } },
    async (req, reply) => {
      await svc.deleteProduct(db, req.params.id);
      return reply.status(204).send();
    },
  );

  r.post(
    "/:id/images",
    {
      onRequest: app.requireRole("admin"),
      schema: { params: productParams, body: addImageBody, response: { 201: productImageOut } },
    },
    async (req, reply) =>
      reply.status(201).send(await svc.addProductImage(db, req.params.id, req.body)),
  );

  r.delete(
    "/:id/images/:imageId",
    { onRequest: app.requireRole("admin"), schema: { params: productImageParams } },
    async (req, reply) => {
      await svc.deleteProductImage(db, req.params.id, req.params.imageId);
      return reply.status(204).send();
    },
  );
}
