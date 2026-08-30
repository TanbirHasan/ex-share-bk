import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../../db/client";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness: process is up.
  app.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }));

  // Readiness: can we reach Postgres?
  app.get("/health/ready", async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: "ready" };
    } catch (err) {
      app.log.error({ err }, "readiness check failed");
      return reply.status(503).send({ error: { code: "DB_UNAVAILABLE", message: "Database not reachable" } });
    }
  });
}
