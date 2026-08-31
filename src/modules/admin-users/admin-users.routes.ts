import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { writeAudit } from "../../lib/audit";

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(["user", "trusted", "moderator", "admin"]).optional(),
  suspended: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const userRow = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: z.enum(["user", "trusted", "moderator", "admin"]),
  suspendedAt: z.date().nullable(),
  reviewCount: z.number().int(),
  problemCount: z.number().int(),
  solutionCount: z.number().int(),
  createdAt: z.date(),
});

const listOut = z.object({
  data: z.array(userRow),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

const patchBody = z
  .object({
    role: z.enum(["user", "trusted", "moderator", "admin"]).optional(),
    suspended: z.boolean().optional(),
  })
  .refine((b) => b.role !== undefined || b.suspended !== undefined, {
    message: "Nothing to change.",
  });

/** Mounted at /api/v1/admin/users. Admin only. */
export async function adminUsersRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    {
      onRequest: app.requireRole("admin"),
      schema: { querystring: listQuery, response: { 200: listOut } },
    },
    async (req) => {
      const { q, role, suspended, limit, offset } = req.query;
      const filters = [
        q
          ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`))
          : undefined,
        role ? eq(users.role, role) : undefined,
        suspended === "true"
          ? sql`${users.suspendedAt} is not null`
          : suspended === "false"
            ? sql`${users.suspendedAt} is null`
            : undefined,
      ].filter(Boolean);
      const where = filters.length ? and(...(filters as never[])) : undefined;

      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            avatarUrl: users.avatarUrl,
            role: users.role,
            suspendedAt: users.suspendedAt,
            reviewCount: users.reviewCount,
            problemCount: users.problemCount,
            solutionCount: users.solutionCount,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(where)
          .orderBy(desc(users.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(users).where(where),
      ]);

      return { data: rows, total: countRows[0]?.count ?? 0, limit, offset };
    },
  );

  r.patch(
    "/:id",
    {
      onRequest: app.requireRole("admin"),
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: patchBody,
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (req) => {
      const targetId = req.params.id;
      const actorId = req.authUser!.id;
      if (targetId === actorId) {
        throw badRequest("SELF_EDIT", "You can't change your own role or status here.");
      }

      const [target] = await db
        .select({ role: users.role, suspendedAt: users.suspendedAt })
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);
      if (!target) throw notFound("USER_NOT_FOUND", "User not found");
      if (target.role === "admin") {
        throw forbidden("Another admin's account can't be modified from here.");
      }

      const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (req.body.role !== undefined) patch.role = req.body.role;
      if (req.body.suspended !== undefined) {
        patch.suspendedAt = req.body.suspended ? new Date() : null;
      }

      await db.update(users).set(patch).where(eq(users.id, targetId));

      await writeAudit(db, {
        actorId,
        action: "user_update",
        targetType: "user",
        targetId,
        meta: {
          role: req.body.role,
          suspended: req.body.suspended,
          prevRole: target.role,
        },
        ip: req.ip ?? null,
      });

      return { ok: true };
    },
  );
}
