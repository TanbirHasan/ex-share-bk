import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { follows, priceAlerts, pricePoints, problems, products } from "../../db/schema";
import { notFound } from "../../lib/errors";

const followBody = z.object({
  targetType: z.enum(["product", "problem"]),
  targetId: z.string().uuid(),
});

async function assertTarget(type: "product" | "problem", id: string) {
  const table = type === "product" ? products : problems;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  if (!row) throw notFound("TARGET_NOT_FOUND", "That item no longer exists.");
}

/** Mounted at /api/v1. Watch products / problems for updates. */
export async function followsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/follows",
    {
      onRequest: app.authenticate,
      schema: {
        body: followBody,
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (req) => {
      await assertTarget(req.body.targetType, req.body.targetId);
      await db
        .insert(follows)
        .values({
          userId: req.authUser!.id,
          targetType: req.body.targetType,
          targetId: req.body.targetId,
        })
        .onConflictDoNothing();
      return { ok: true };
    },
  );

  r.delete(
    "/follows",
    {
      onRequest: app.authenticate,
      schema: { body: followBody, response: { 200: z.object({ ok: z.boolean() }) } },
    },
    async (req) => {
      await db
        .delete(follows)
        .where(
          and(
            eq(follows.userId, req.authUser!.id),
            eq(follows.targetType, req.body.targetType),
            eq(follows.targetId, req.body.targetId),
          ),
        );
      return { ok: true };
    },
  );

  r.get(
    "/me/following-ids",
    {
      onRequest: app.authenticate,
      schema: {
        response: {
          200: z.object({
            products: z.array(z.string().uuid()),
            problems: z.array(z.string().uuid()),
          }),
        },
      },
    },
    async (req) => {
      const rows = await db
        .select({ targetType: follows.targetType, targetId: follows.targetId })
        .from(follows)
        .where(eq(follows.userId, req.authUser!.id));
      return {
        products: rows.filter((x) => x.targetType === "product").map((x) => x.targetId),
        problems: rows.filter((x) => x.targetType === "problem").map((x) => x.targetId),
      };
    },
  );

  r.get(
    "/me/following",
    {
      onRequest: app.authenticate,
      schema: {
        response: {
          200: z.object({
            products: z.array(
              z.object({
                id: z.string().uuid(),
                slug: z.string(),
                name: z.string(),
                primaryImage: z.string().nullable(),
                ratingAvg: z.number(),
                ratingCount: z.number().int(),
                followedAt: z.coerce.date(),
              }),
            ),
            problems: z.array(
              z.object({
                id: z.string().uuid(),
                slug: z.string(),
                title: z.string(),
                reportCount: z.number().int(),
                productName: z.string(),
                followedAt: z.coerce.date(),
              }),
            ),
          }),
        },
      },
    },
    async (req) => {
      const uid = req.authUser!.id;
      const [prodRows, probRows] = await Promise.all([
        db
          .select({
            id: products.id,
            slug: products.slug,
            name: products.name,
            primaryImage: products.primaryImage,
            ratingAvg: products.ratingAvg,
            ratingCount: products.ratingCount,
            followedAt: follows.createdAt,
          })
          .from(follows)
          .innerJoin(products, eq(follows.targetId, products.id))
          .where(and(eq(follows.userId, uid), eq(follows.targetType, "product")))
          .orderBy(desc(follows.createdAt)),
        db
          .select({
            id: problems.id,
            slug: problems.slug,
            title: problems.title,
            reportCount: problems.reportCount,
            productName: products.name,
            followedAt: follows.createdAt,
          })
          .from(follows)
          .innerJoin(problems, eq(follows.targetId, problems.id))
          .innerJoin(products, eq(problems.productId, products.id))
          .where(and(eq(follows.userId, uid), eq(follows.targetType, "problem")))
          .orderBy(desc(follows.createdAt)),
      ]);

      return {
        products: prodRows.map((x) => ({ ...x, ratingAvg: Number(x.ratingAvg) })),
        problems: probRows,
      };
    },
  );

  r.get(
    "/me/price-alerts",
    {
      onRequest: app.authenticate,
      schema: {
        response: {
          200: z.array(
            z.object({
              productId: z.string().uuid(),
              slug: z.string(),
              name: z.string(),
              primaryImage: z.string().nullable(),
              targetPrice: z.number().int(),
              lowestSeen: z.number().int().nullable(),
              createdAt: z.coerce.date(),
            }),
          ),
        },
      },
    },
    async (req) => {
      const rows = await db
        .select({
          productId: priceAlerts.productId,
          slug: products.slug,
          name: products.name,
          primaryImage: products.primaryImage,
          targetPrice: priceAlerts.targetPrice,
          createdAt: priceAlerts.createdAt,
          lowestSeen: sql<number | null>`(
            select min(${pricePoints.price}) from ${pricePoints}
            where ${pricePoints.productId} = ${priceAlerts.productId}
          )`,
        })
        .from(priceAlerts)
        .innerJoin(products, eq(priceAlerts.productId, products.id))
        .where(eq(priceAlerts.userId, req.authUser!.id))
        .orderBy(desc(priceAlerts.createdAt));
      return rows;
    },
  );
}
