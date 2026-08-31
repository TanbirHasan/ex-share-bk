import type { DB } from "../db/client";
import { auditLog } from "../db/schema";

/** Append one entry to the admin/moderator action trail. */
export async function writeAudit(
  db: DB,
  entry: {
    actorId: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    meta?: Record<string, unknown>;
    ip?: string | null;
  },
): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    meta: entry.meta ?? {},
    ip: entry.ip ?? null,
  });
}
