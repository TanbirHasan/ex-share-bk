import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { config } from "../../config";
import { db } from "../../db/client";
import { unauthorized } from "../../lib/errors";
import {
  consumeMagicLink,
  requestMagicLink,
  upsertUserByEmail,
} from "../auth/auth.service";

const userResponse = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: z.string(),
});

const syncBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().max(2048).optional(),
  provider: z.string().max(40).optional(),
});

const magicRequestBody = z.object({ email: z.string().email() });
const magicConsumeBody = z.object({
  email: z.string().email(),
  token: z.string().min(10).max(200),
});

function toUserResponse(u: {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
}) {
  return { userId: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl, role: u.role };
}

/**
 * Server-to-server routes called by the Next.js frontend, guarded by a shared secret.
 * NOT for browsers. Mounted under /internal.
 */
export async function internalRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  app.addHook("onRequest", async (req) => {
    if (req.headers["x-internal-secret"] !== config.INTERNAL_API_SECRET) {
      throw unauthorized("Invalid internal secret");
    }
  });

  // OAuth (Google) sign-in -> upsert user, return role.
  r.post(
    "/auth/sync",
    { schema: { body: syncBody, response: { 200: userResponse } } },
    async (req) => toUserResponse(await upsertUserByEmail(db, req.body)),
  );

  // Magic link step 1: issue a token (frontend emails the link).
  r.post(
    "/auth/magic-link/request",
    {
      schema: {
        body: magicRequestBody,
        response: { 200: z.object({ token: z.string(), expiresAt: z.date() }) },
      },
    },
    async (req) => requestMagicLink(db, req.body.email),
  );

  // Magic link step 2: consume the token -> upsert user, return it.
  r.post(
    "/auth/magic-link/consume",
    { schema: { body: magicConsumeBody, response: { 200: userResponse } } },
    async (req) => toUserResponse(await consumeMagicLink(db, req.body.email, req.body.token)),
  );
}
