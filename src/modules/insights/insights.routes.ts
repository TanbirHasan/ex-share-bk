import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { searchQueries } from "../../db/schema";

const insightsQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const queryRow = z.object({
  query: z.string(),
  count: z.number().int(),
  lastAt: z.coerce.date(),
});

const insightsOut = z.object({
  days: z.number().int(),
  totals: z.object({
    searches: z.number().int(),
    distinctQueries: z.number().int(),
    zeroResultRate: z.number(),
  }),
  zeroResults: z.array(queryRow),
  topQueries: z.array(queryRow.extend({ avgResults: z.number() })),
});

const int = (expr: ReturnType<typeof sql>) => sql<number>`(${expr})::int`;

/** Mounted at /api/v1/admin/search-insights. Admin only. */
export async function insightsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    {
      onRequest: app.requireRole("admin"),
      schema: { querystring: insightsQuery, response: { 200: insightsOut } },
    },
    async (req) => {
      const { days } = req.query;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const normalized = sql<string>`lower(btrim(${searchQueries.query}))`;
      const inWindow = gte(searchQueries.createdAt, since);

      const [totalRows, distinctRows, zeroTotalRows, zeroRows, topRows] = await Promise.all([
        db
          .select({ n: int(sql`count(*)`) })
          .from(searchQueries)
          .where(inWindow),
        db
          .select({ n: int(sql`count(distinct ${normalized})`) })
          .from(searchQueries)
          .where(inWindow),
        db
          .select({ n: int(sql`count(*)`) })
          .from(searchQueries)
          .where(and(inWindow, eq(searchQueries.resultsCount, 0))),
        db
          .select({
            query: normalized,
            count: int(sql`count(*)`),
            lastAt: sql<string>`max(${searchQueries.createdAt})`,
          })
          .from(searchQueries)
          .where(and(inWindow, eq(searchQueries.resultsCount, 0)))
          .groupBy(normalized)
          .orderBy(desc(sql`count(*)`))
          .limit(50),
        db
          .select({
            query: normalized,
            count: int(sql`count(*)`),
            lastAt: sql<string>`max(${searchQueries.createdAt})`,
            avgResults: sql<string>`round(coalesce(avg(${searchQueries.resultsCount}), 0)::numeric, 1)`,
          })
          .from(searchQueries)
          .where(inWindow)
          .groupBy(normalized)
          .orderBy(desc(sql`count(*)`))
          .limit(20),
      ]);

      const searches = totalRows[0]?.n ?? 0;
      const zeroTotal = zeroTotalRows[0]?.n ?? 0;

      return {
        days,
        totals: {
          searches,
          distinctQueries: distinctRows[0]?.n ?? 0,
          zeroResultRate: searches > 0 ? Math.round((zeroTotal / searches) * 100) : 0,
        },
        zeroResults: zeroRows.map((x) => ({
          query: x.query,
          count: x.count,
          lastAt: new Date(x.lastAt),
        })),
        topQueries: topRows.map((x) => ({
          query: x.query,
          count: x.count,
          lastAt: new Date(x.lastAt),
          avgResults: Number(x.avgResults),
        })),
      };
    },
  );
}
