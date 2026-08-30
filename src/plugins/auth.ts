import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { config } from "../config";
import { forbidden, unauthorized } from "../lib/errors";

export type AuthUser = { id: string; role: string };

// JWT payload minted by the Next.js frontend (Auth.js) and signed with AUTH_SHARED_SECRET.
type TokenPayload = { sub: string; role?: string };

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
  interface FastifyInstance {
    /** onRequest hook: require a valid bearer token, populates request.authUser. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** onRequest hook factory: require an authenticated user with one of the given roles. */
    requireRole: (
      ...roles: string[]
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: config.AUTH_SHARED_SECRET,
    formatUser: (payload) => {
      const p = payload as TokenPayload;
      return { id: p.sub, role: p.role ?? "user" };
    },
  });

  app.decorateRequest("authUser", null);

  app.decorate("authenticate", async function (req: FastifyRequest) {
    try {
      await req.jwtVerify();
      req.authUser = req.user as AuthUser;
    } catch {
      throw unauthorized();
    }
  });

  app.decorate("requireRole", function (...roles: string[]) {
    return async function (req: FastifyRequest, reply: FastifyReply) {
      await app.authenticate(req, reply);
      if (!req.authUser || !roles.includes(req.authUser.role)) {
        throw forbidden();
      }
    };
  });
}

export default fp(authPlugin, { name: "auth" });
