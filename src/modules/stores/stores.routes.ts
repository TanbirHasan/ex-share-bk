import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { products, reviews, stores, users } from "../../db/schema";
import { notFound } from "../../lib/errors";

const storeListItem = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  reviewCount: z.number().int(),
  avgRating: z.number(),
});

const storeProfile = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  note: z.string().nullable(),
  reviewCount: z.number().int(),
  avgRating: z.number(),
  wouldBuyAgainPct: z.number().int(),
  recentReviews: z.array(
    z.object({
      id: z.string().uuid(),
      rating: z.number(),
      comment: z.string().nullable(),
      createdAt: z.coerce.date(),
      authorName: z.string().nullable(),
      product: z.object({ slug: z.string(), name: z.string() }),
    }),
  ),
});

/** Mounted at /api/v1/stores. Public. */
export async function storesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    { schema: { response: { 200: z.array(storeListItem) } } },
    async () => {
      const rows = await db
        .select({
          id: stores.id,
          slug: stores.slug,
          name: stores.name,
          city: stores.city,
          reviewCount: sql<number>`count(${reviews.id})::int`,
          avgRating: sql<string>`coalesce(round(avg(${reviews.rating})::numeric, 1), 0)`,
        })
        .from(stores)
        .leftJoin(
          reviews,
          and(eq(reviews.storeId, stores.id), eq(reviews.status, "approved")),
        )
        .groupBy(stores.id)
        .orderBy(desc(sql`count(${reviews.id})`), stores.name);

      return rows.map((x) => ({ ...x, avgRating: Number(x.avgRating) }));
    },
  );

  r.get(
    "/:slug",
    {
      schema: {
        params: z.object({ slug: z.string().min(1).max(140) }),
        response: { 200: storeProfile },
      },
    },
    async (req) => {
      const [store] = await db
        .select()
        .from(stores)
        .where(eq(stores.slug, req.params.slug))
        .limit(1);
      if (!store) throw notFound("STORE_NOT_FOUND", "Store not found");

      const linked = and(
        eq(reviews.storeId, store.id),
        eq(reviews.status, "approved"),
      );

      const [[agg], recent] = await Promise.all([
        db
          .select({
            n: sql<number>`count(*)::int`,
            avg: sql<string>`coalesce(round(avg(${reviews.rating})::numeric, 1), 0)`,
            buyAgain: sql<number>`coalesce(round(100.0 * count(*) filter (where ${reviews.wouldBuyAgain} = 'yes') / nullif(count(*), 0)), 0)::int`,
          })
          .from(reviews)
          .where(linked),
        db
          .select({
            id: reviews.id,
            rating: reviews.rating,
            comment: reviews.comment,
            createdAt: reviews.createdAt,
            authorName: users.name,
            productSlug: products.slug,
            productName: products.name,
          })
          .from(reviews)
          .innerJoin(users, eq(reviews.userId, users.id))
          .innerJoin(products, eq(reviews.productId, products.id))
          .where(linked)
          .orderBy(desc(reviews.createdAt))
          .limit(10),
      ]);

      return {
        id: store.id,
        slug: store.slug,
        name: store.name,
        city: store.city,
        note: store.note,
        reviewCount: agg?.n ?? 0,
        avgRating: Number(agg?.avg ?? 0),
        wouldBuyAgainPct: agg?.buyAgain ?? 0,
        recentReviews: recent.map((x) => ({
          id: x.id,
          rating: x.rating,
          comment: x.comment,
          createdAt: x.createdAt,
          authorName: x.authorName,
          product: { slug: x.productSlug, name: x.productName },
        })),
      };
    },
  );
}
