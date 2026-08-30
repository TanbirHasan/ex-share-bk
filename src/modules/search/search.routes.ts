import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../db/client";
import { searchOut, searchQuery, suggestOut, suggestQuery } from "./search.schema";
import * as svc from "./search.service";

/** Mounted at /api/v1/search. Public. */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    { schema: { querystring: searchQuery, response: { 200: searchOut } } },
    async (req) => svc.search(db, req.query.q, req.query.limit),
  );

  r.get(
    "/suggest",
    { schema: { querystring: suggestQuery, response: { 200: suggestOut } } },
    async (req) => svc.suggest(db, req.query.q),
  );
}
