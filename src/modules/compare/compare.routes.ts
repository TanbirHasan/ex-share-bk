import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../db/client";
import { compareOut, compareQuery } from "./compare.schema";
import { compareProducts } from "./compare.service";

/** Mounted at /api/v1/compare. Public. */
export async function compareRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    { schema: { querystring: compareQuery, response: { 200: compareOut } } },
    async (req) => compareProducts(db, req.query.slugs),
  );
}
