import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { notFound } from "../../lib/errors";

const meOut = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: z.string(),
  reviewCount: z.number().int(),
  problemCount: z.number().int(),
  solutionCount: z.number().int(),
  createdAt: z.date(),
});

/** Mounted at /api/v1/me. Returns the currently authenticated user. */
export async function meRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    { onRequest: app.authenticate, schema: { response: { 200: meOut } } },
    async (req) => {
      const [row] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          avatarUrl: users.avatarUrl,
          role: users.role,
          reviewCount: users.reviewCount,
          problemCount: users.problemCount,
          solutionCount: users.solutionCount,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, req.authUser!.id))
        .limit(1);
      if (!row) throw notFound("USER_NOT_FOUND", "User not found");
      return row;
    },
  );
}
