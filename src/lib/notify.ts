import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../db/client";
import { follows, notifications } from "../db/schema";

type NotificationType =
  | "answer_received"
  | "comment_received"
  | "helpful_vote"
  | "solution_worked"
  | "content_approved"
  | "content_rejected"
  | "content_removed"
  | "followed_new_review"
  | "followed_new_problem"
  | "followed_new_solution"
  | "price_drop";

type NotifyInput = {
  userIds: (string | null | undefined)[];
  type: NotificationType;
  actorId?: string | null;
  target?: { type: string; id: string } | null;
  meta?: Record<string, unknown>;
};

/**
 * Fan a notification out to recipients. Drops blanks, the actor themselves,
 * and duplicates. Failures are swallowed — a notification must never break the
 * action that triggered it.
 */
export async function notify(db: DB, input: NotifyInput): Promise<void> {
  try {
    const recipients = [
      ...new Set(
        input.userIds.filter(
          (id): id is string => typeof id === "string" && id !== input.actorId,
        ),
      ),
    ];
    if (recipients.length === 0) return;

    await db.insert(notifications).values(
      recipients.map((userId) => ({
        userId,
        type: input.type,
        actorId: input.actorId ?? null,
        targetType: input.target?.type ?? null,
        targetId: input.target?.id ?? null,
        meta: input.meta ?? {},
      })),
    );
  } catch {
    // best-effort
  }
}

/**
 * Like `notify` but skips any recipient who already has an *unread*
 * notification of the same type for the same target — keeps repeated
 * helpful-votes / confirmations from stacking up.
 */
export async function notifyOnce(db: DB, input: NotifyInput): Promise<void> {
  try {
    if (!input.target) return notify(db, input);
    const recipients = [
      ...new Set(
        input.userIds.filter(
          (id): id is string => typeof id === "string" && id !== input.actorId,
        ),
      ),
    ];
    if (recipients.length === 0) return;

    const existing = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          inArray(notifications.userId, recipients),
          eq(notifications.type, input.type),
          eq(notifications.targetType, input.target.type),
          eq(notifications.targetId, input.target.id),
          isNull(notifications.readAt),
        ),
      );
    const skip = new Set(existing.map((x) => x.userId));
    const fresh = recipients.filter((id) => !skip.has(id));
    if (fresh.length === 0) return;

    await notify(db, { ...input, userIds: fresh });
  } catch {
    // best-effort
  }
}

/** User ids following a product or problem (minus one, usually the actor). */
export async function followerIds(
  db: DB,
  targetType: "product" | "problem",
  targetId: string,
  exclude?: string | null,
): Promise<string[]> {
  const rows = await db
    .select({ userId: follows.userId })
    .from(follows)
    .where(and(eq(follows.targetType, targetType), eq(follows.targetId, targetId)));
  return rows.map((r) => r.userId).filter((id) => id !== exclude);
}
