import { desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { auditLog, users } from "../../db/schema";

const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const auditRow = z.object({
  id: z.string().uuid(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  meta: z.record(z.unknown()),
  ip: z.string().nullable(),
  createdAt: z.date(),
  actor: z.object({ id: z.string().uuid(), name: z.string().nullable() }).nullable(),
});

const auditOut = z.object({
  data: z.array(auditRow),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

/** Mounted at /api/v1/admin/audit-log. Admin only. */
export async function auditRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    {
      onRequest: app.requireRole("admin"),
      schema: { querystring: auditQuery, response: { 200: auditOut } },
    },
    async (req) => {
      const { limit, offset } = req.query;

      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: auditLog.id,
            action: auditLog.action,
            targetType: auditLog.targetType,
            targetId: auditLog.targetId,
            meta: auditLog.meta,
            ip: auditLog.ip,
            createdAt: auditLog.createdAt,
            actorId: users.id,
            actorName: users.name,
          })
          .from(auditLog)
          .leftJoin(users, eq(auditLog.actorId, users.id))
          .orderBy(desc(auditLog.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(auditLog),
      ]);

      return {
        data: rows.map((x) => ({
          id: x.id,
          action: x.action,
          targetType: x.targetType,
          targetId: x.targetId,
          meta: x.meta,
          ip: x.ip,
          createdAt: x.createdAt,
          actor: x.actorId ? { id: x.actorId, name: x.actorName } : null,
        })),
        total: countRows[0]?.count ?? 0,
        limit,
        offset,
      };
    },
  );
}
