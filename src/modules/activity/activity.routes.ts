import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { z } from "zod";
import { db } from "../../db/client";
import { problems, products, reviews, solutions, users } from "../../db/schema";
import { activityItem, activityOut, activityQuery } from "./activity.schema";

type Item = z.infer<typeof activityItem>;

function snippet(text: string, n = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n).trimEnd()}…` : clean;
}

/** Mounted at /api/v1/activity. Public. Latest community contributions for the homepage. */
export async function activityRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    { schema: { querystring: activityQuery, response: { 200: activityOut } } },
    async (req) => {
      const { limit } = req.query;

      const [rev, prob, sol] = await Promise.all([
        db
          .select({
            id: reviews.id,
            createdAt: reviews.createdAt,
            comment: reviews.comment,
            rating: reviews.rating,
            actorId: users.id,
            actorName: users.name,
            actorAvatar: users.avatarUrl,
            productSlug: products.slug,
            productName: products.name,
          })
          .from(reviews)
          .innerJoin(users, eq(reviews.userId, users.id))
          .innerJoin(products, eq(reviews.productId, products.id))
          .where(eq(reviews.status, "approved"))
          .orderBy(desc(reviews.createdAt))
          .limit(limit),

        db
          .select({
            id: problems.id,
            createdAt: problems.createdAt,
            title: problems.title,
            description: problems.description,
            slug: problems.slug,
            actorId: users.id,
            actorName: users.name,
            actorAvatar: users.avatarUrl,
            productSlug: products.slug,
            productName: products.name,
          })
          .from(problems)
          .innerJoin(products, eq(problems.productId, products.id))
          .leftJoin(users, eq(problems.createdBy, users.id))
          .where(eq(problems.status, "approved"))
          .orderBy(desc(problems.createdAt))
          .limit(limit),

        db
          .select({
            id: solutions.id,
            createdAt: solutions.createdAt,
            body: solutions.body,
            actorId: users.id,
            actorName: users.name,
            actorAvatar: users.avatarUrl,
            problemSlug: problems.slug,
            problemTitle: problems.title,
            productSlug: products.slug,
            productName: products.name,
          })
          .from(solutions)
          .innerJoin(users, eq(solutions.userId, users.id))
          .innerJoin(problems, eq(solutions.problemId, problems.id))
          .innerJoin(products, eq(problems.productId, products.id))
          .where(eq(solutions.status, "approved"))
          .orderBy(desc(solutions.createdAt))
          .limit(limit),
      ]);

      const items: Item[] = [
        ...rev.map((x): Item => ({
          type: "review",
          id: x.id,
          createdAt: x.createdAt,
          actor: { id: x.actorId, name: x.actorName, avatarUrl: x.actorAvatar },
          product: { slug: x.productSlug, name: x.productName },
          headline: x.productName,
          snippet: x.comment ? snippet(x.comment) : `Rated ${x.rating}/5`,
          href: `/products/${x.productSlug}`,
        })),
        ...prob.map((x): Item => ({
          type: "problem",
          id: x.id,
          createdAt: x.createdAt,
          actor: x.actorId
            ? { id: x.actorId, name: x.actorName, avatarUrl: x.actorAvatar }
            : null,
          product: { slug: x.productSlug, name: x.productName },
          headline: x.title,
          snippet: snippet(x.description),
          href: `/problems/${x.slug}`,
        })),
        ...sol.map((x): Item => ({
          type: "solution",
          id: x.id,
          createdAt: x.createdAt,
          actor: { id: x.actorId, name: x.actorName, avatarUrl: x.actorAvatar },
          product: { slug: x.productSlug, name: x.productName },
          headline: x.problemTitle,
          snippet: snippet(x.body),
          href: `/problems/${x.problemSlug}`,
        })),
      ];

      items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return items.slice(0, limit);
    },
  );
}
