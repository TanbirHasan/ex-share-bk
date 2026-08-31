import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../db/client";
import { recommendOut, recommendQuery } from "./recommend.schema";
import { recommend } from "./recommend.service";

/** Mounted at /api/v1/recommend. Public. */
export async function recommendRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    { schema: { querystring: recommendQuery, response: { 200: recommendOut } } },
    async (req) =>
      recommend(db, req.query.category, req.query.budgetMax ?? null, req.query.priority),
  );
}
