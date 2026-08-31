import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { notifications, users } from "../../db/schema";

const notificationType = z.enum([
  "answer_received",
  "comment_received",
  "helpful_vote",
  "solution_worked",
  "content_approved",
  "content_rejected",
  "content_removed",
  "followed_new_review",
  "followed_new_problem",
  "followed_new_solution",
  "price_drop",
]);

const notificationOut = z.object({
  id: z.string().uuid(),
  type: notificationType,
  meta: z.record(z.unknown()),
  actor: z.object({ name: z.string().nullable(), avatarUrl: z.string().nullable() }).nullable(),
  readAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});

const listOut = z.object({
  data: z.array(notificationOut),
  unreadCount: z.number().int(),
  total: z.number().int(),
});

/** Mounted at /api/v1/me/notifications. Always scoped to the caller. */
export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    {
      onRequest: app.authenticate,
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: { 200: listOut },
      },
    },
    async (req) => {
      const uid = req.authUser!.id;
      const { limit, offset } = req.query;

      const [rows, [totalRow], [unreadRow]] = await Promise.all([
        db
          .select({
            id: notifications.id,
            type: notifications.type,
            meta: notifications.meta,
            readAt: notifications.readAt,
            createdAt: notifications.createdAt,
            actorName: users.name,
            actorAvatar: users.avatarUrl,
          })
          .from(notifications)
          .leftJoin(users, eq(notifications.actorId, users.id))
          .where(eq(notifications.userId, uid))
          .orderBy(desc(notifications.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(notifications)
          .where(eq(notifications.userId, uid)),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(notifications)
          .where(and(eq(notifications.userId, uid), isNull(notifications.readAt))),
      ]);

      return {
        data: rows.map((x) => ({
          id: x.id,
          type: x.type,
          meta: x.meta,
          actor:
            x.actorName !== null || x.actorAvatar !== null
              ? { name: x.actorName, avatarUrl: x.actorAvatar }
              : null,
          readAt: x.readAt,
          createdAt: x.createdAt,
        })),
        unreadCount: unreadRow?.n ?? 0,
        total: totalRow?.n ?? 0,
      };
    },
  );

  r.get(
    "/unread-count",
    {
      onRequest: app.authenticate,
      schema: { response: { 200: z.object({ count: z.number().int() }) } },
    },
    async (req) => {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(eq(notifications.userId, req.authUser!.id), isNull(notifications.readAt)),
        );
      return { count: row?.n ?? 0 };
    },
  );

  r.post(
    "/read",
    {
      onRequest: app.authenticate,
      schema: {
        body: z.object({ ids: z.array(z.string().uuid()).optional() }).default({}),
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (req) => {
      const uid = req.authUser!.id;
      const base = and(eq(notifications.userId, uid), isNull(notifications.readAt));
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          req.body.ids && req.body.ids.length
            ? and(base, sql`${notifications.id} = any(${req.body.ids})`)
            : base,
        );
      return { ok: true };
    },
  );
}
