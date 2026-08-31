import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../db/client";
import { translateBody, translateOut } from "./translate.schema";
import * as svc from "./translate.service";

/** Mounted at /api/v1/translate. Public — translates already-visible content. */
export async function translateRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/",
    {
      // Tighter than the global limit: a human translating a page hits this a
      // handful of times; a script hammering every item does not get far.
      // Cache hits still count, but they're cheap — the point is to cap total
      // pressure on the (potentially paid) translation provider.
      config: {
        rateLimit: {
          max: 40,
          timeWindow: "10 minutes",
          errorResponseBuilder: () => ({
            error: {
              code: "TRANSLATE_RATE_LIMITED",
              message:
                "You've translated a lot in a short time. Try again in a few minutes.",
            },
          }),
        },
      },
      schema: { body: translateBody, response: { 200: translateOut } },
    },
    async (req) => svc.translateContent(db, req.body),
  );
}
