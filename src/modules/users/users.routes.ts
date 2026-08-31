import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { db } from "../../db/client";
import { profileOut, userIdParams } from "./users.schema";
import { getProfile } from "./users.service";

/** Mounted at /api/v1/users. Public. */
export async function usersRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/:id",
    { schema: { params: userIdParams, response: { 200: profileOut } } },
    async (req) => getProfile(db, req.params.id),
  );
}
