import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { users } from "../db/schema";
import { forbidden } from "./errors";

/** New non-trusted users have their first few contributions held for review. */
const HOLD_FIRST_N = 3;

/**
 * One lookup that gates a content-creating request:
 *  - throws 403 if the account is suspended
 *  - returns the moderation status the new row should get
 *    ("pending" for a brand-new user's first few posts, else "approved")
 *
 * Read paths never call this — it's writes only.
 */
export async function checkContentGate(
  db: DB,
  userId: string,
): Promise<{ status: "pending" | "approved" }> {
  const [row] = await db
    .select({
      role: users.role,
      suspendedAt: users.suspendedAt,
      reviewCount: users.reviewCount,
      problemCount: users.problemCount,
      solutionCount: users.solutionCount,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (row?.suspendedAt) {
    throw forbidden("Your account is suspended and can't post right now.");
  }
  if (!row || row.role === "trusted" || row.role === "moderator" || row.role === "admin") {
    return { status: "approved" };
  }

  const contributions = row.reviewCount + row.problemCount + row.solutionCount;
  return { status: contributions < HOLD_FIRST_N ? "pending" : "approved" };
}
