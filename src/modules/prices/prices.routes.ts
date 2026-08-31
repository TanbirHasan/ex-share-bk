import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { pricePoints, products, stores } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { resolveStore } from "../../lib/stores";

const pointOut = z.object({
  id: z.string().uuid(),
  price: z.number().int(),
  source: z.enum(["review", "manual"]),
  storeName: z.string().nullable(),
  note: z.string().nullable(),
  observedAt: z.coerce.date(),
});

const pricesOut = z.object({
  current: z.object({ min: z.number().nullable(), max: z.number().nullable() }),
  lowest: z
    .object({ price: z.number().int(), storeName: z.string().nullable(), observedAt: z.coerce.date() })
    .nullable(),
  points: z.array(pointOut),
});

/** Mounted at /api/v1/products. Price history + crowd-sourced sightings. */
export async function pricesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/:id/prices",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: pricesOut },
      },
    },
    async (req) => {
      const [product] = await db
        .select({ priceMin: products.priceMin, priceMax: products.priceMax })
        .from(products)
        .where(eq(products.id, req.params.id))
        .limit(1);
      if (!product) throw notFound("PRODUCT_NOT_FOUND", "Product not found");

      const since = new Date(Date.now() - 550 * 24 * 60 * 60 * 1000); // ~18 months
      const rows = await db
        .select({
          id: pricePoints.id,
          price: pricePoints.price,
          source: pricePoints.source,
          note: pricePoints.note,
          observedAt: pricePoints.observedAt,
          storeName: stores.name,
        })
        .from(pricePoints)
        .leftJoin(stores, eq(pricePoints.storeId, stores.id))
        .where(and(eq(pricePoints.productId, req.params.id), gte(pricePoints.observedAt, since)))
        .orderBy(desc(pricePoints.observedAt))
        .limit(30);

      const lowest = rows.length
        ? rows.reduce((lo, p) => (p.price < lo.price ? p : lo), rows[0]!)
        : null;

      return {
        current: { min: product.priceMin, max: product.priceMax },
        lowest: lowest
          ? {
              price: lowest.price,
              storeName: lowest.storeName,
              observedAt: lowest.observedAt,
            }
          : null,
        points: rows,
      };
    },
  );

  r.post(
    "/:id/prices",
    {
      onRequest: app.authenticate,
      config: {
        rateLimit: {
          max: 15,
          timeWindow: "1 hour",
          errorResponseBuilder: () => ({
            error: { code: "PRICE_RATE_LIMITED", message: "That's a lot of price reports. Try later." },
          }),
        },
      },
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          price: z.number().int().min(1).max(100_000_000),
          storeName: z.string().trim().max(120).optional(),
          note: z.string().trim().max(300).optional(),
        }),
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (req) => {
      const [product] = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, req.params.id))
        .limit(1);
      if (!product) throw notFound("PRODUCT_NOT_FOUND", "Product not found");

      const store = await resolveStore(db, req.body.storeName);
      await db.insert(pricePoints).values({
        productId: req.params.id,
        price: req.body.price,
        source: "manual",
        storeId: store?.id ?? null,
        reportedBy: req.authUser!.id,
        note: req.body.note ?? null,
      });
      return { ok: true };
    },
  );
}
