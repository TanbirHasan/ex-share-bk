import { eq, gt, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { problems, products, reviews, solutions, users } from "../../db/schema";

const statsOut = z.object({
  reviews: z.number().int(),
  problems: z.number().int(),
  solutions: z.number().int(),
  contributors: z.number().int(),
  products: z.number().int(),
});

const count = sql<number>`count(*)::int`;

/** Mounted at /api/v1/stats. Public. Community activity totals for the homepage. */
export async function statsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/", { schema: { response: { 200: statsOut } } }, async () => {
    const [rev, prob, sol, contrib, prod] = await Promise.all([
      db.select({ n: count }).from(reviews).where(eq(reviews.status, "approved")),
      db.select({ n: count }).from(problems).where(eq(problems.status, "approved")),
      db.select({ n: count }).from(solutions).where(eq(solutions.status, "approved")),
      db
        .select({ n: count })
        .from(users)
        .where(
          or(
            gt(users.reviewCount, 0),
            gt(users.problemCount, 0),
            gt(users.solutionCount, 0),
          ),
        ),
      db.select({ n: count }).from(products),
    ]);

    return {
      reviews: rev[0]?.n ?? 0,
      problems: prob[0]?.n ?? 0,
      solutions: sol[0]?.n ?? 0,
      contributors: contrib[0]?.n ?? 0,
      products: prod[0]?.n ?? 0,
    };
  });
}
