import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { productLookupBody, productLookupOut } from "./ai-assist.schema";
import * as svc from "./ai-assist.service";

/** Mounted at /api/v1/admin/ai-assist. Admin-only — drafts catalogue fields from a web search. */
export async function aiAssistRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/product-lookup",
    {
      onRequest: app.requireRole("admin"),
      // Each call fans out to a paid-above-free-tier search + LLM call —
      // cap it well below Tavily's free monthly quota.
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 hour",
          errorResponseBuilder: () => ({
            error: {
              code: "AI_ASSIST_RATE_LIMITED",
              message: "You've used a lot of AI lookups this hour. Try again later.",
            },
          }),
        },
      },
      schema: { body: productLookupBody, response: { 200: productLookupOut } },
    },
    async (req) => svc.productLookup(req.body),
  );
}
