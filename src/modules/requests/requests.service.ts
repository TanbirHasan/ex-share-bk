import { and, desc, eq, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { productRequests, users } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { paginated, type PageParams } from "../../lib/pagination";

type Status = "open" | "added" | "rejected";

export async function createRequest(
  db: DB,
  userId: string,
  input: { rawText: string; categoryGuess?: string },
): Promise<{ ok: boolean; duplicate: boolean }> {
  // Don't stack identical open requests from the same person.
  const [dup] = await db
    .select({ id: productRequests.id })
    .from(productRequests)
    .where(
      and(
        eq(productRequests.userId, userId),
        eq(productRequests.status, "open"),
        sql`lower(${productRequests.rawText}) = lower(${input.rawText})`,
      ),
    )
    .limit(1);
  if (dup) return { ok: true, duplicate: true };

  await db.insert(productRequests).values({
    userId,
    rawText: input.rawText,
    categoryGuess: input.categoryGuess ?? null,
  });
  return { ok: true, duplicate: false };
}

export async function listRequests(db: DB, status: Status, page: PageParams) {
  const where = eq(productRequests.status, status);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: productRequests.id,
        rawText: productRequests.rawText,
        categoryGuess: productRequests.categoryGuess,
        status: productRequests.status,
        createdAt: productRequests.createdAt,
        requesterId: users.id,
        requesterName: users.name,
      })
      .from(productRequests)
      .leftJoin(users, eq(productRequests.userId, users.id))
      .where(where)
      .orderBy(desc(productRequests.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(productRequests)
      .where(where),
  ]);
  const count = countRows[0]?.count ?? 0;

  const data = rows.map((r) => ({
    id: r.id,
    rawText: r.rawText,
    categoryGuess: r.categoryGuess,
    status: r.status,
    createdAt: r.createdAt,
    requester: r.requesterId ? { id: r.requesterId, name: r.requesterName } : null,
  }));

  return paginated(data, count ?? 0, page);
}

export async function updateRequest(
  db: DB,
  id: string,
  status: "added" | "rejected",
): Promise<{ ok: boolean }> {
  const [row] = await db
    .update(productRequests)
    .set({ status })
    .where(eq(productRequests.id, id))
    .returning({ id: productRequests.id });
  if (!row) throw notFound("REQUEST_NOT_FOUND", "Product request not found");
  return { ok: true };
}
