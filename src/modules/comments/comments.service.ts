import { and, asc, eq, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { comments, reviews, solutions, users } from "../../db/schema";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { paginated, type PageParams } from "../../lib/pagination";
import { reputationScore } from "../../lib/reputation";

type TargetType = "review" | "solution";

const baseSelect = {
  id: comments.id,
  targetType: comments.targetType,
  targetId: comments.targetId,
  body: comments.body,
  contentLang: comments.contentLang,
  createdAt: comments.createdAt,
  userId: comments.userId,
  authorId: users.id,
  authorName: users.name,
  authorAvatar: users.avatarUrl,
  authorReviews: users.reviewCount,
  authorProblems: users.problemCount,
  authorSolutions: users.solutionCount,
  authorHelpful: users.helpfulReceived,
};

function shape(row: Record<string, unknown>, viewerId?: string) {
  return {
    id: row.id as string,
    targetType: row.targetType as TargetType,
    targetId: row.targetId as string,
    body: row.body as string,
    contentLang: row.contentLang as "bn" | "en",
    createdAt: row.createdAt as Date,
    author: {
      id: row.authorId as string,
      name: (row.authorName ?? null) as string | null,
      avatarUrl: (row.authorAvatar ?? null) as string | null,
      reputation: reputationScore({
        reviews: (row.authorReviews ?? 0) as number,
        problems: (row.authorProblems ?? 0) as number,
        solutions: (row.authorSolutions ?? 0) as number,
        helpfulReceived: (row.authorHelpful ?? 0) as number,
      }),
    },
    viewerCanEdit: viewerId != null && row.userId === viewerId,
  };
}

async function assertTarget(db: DB, type: TargetType, id: string) {
  const table = type === "review" ? reviews : solutions;
  const [row] = await db
    .select({ id: table.id, status: table.status })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  if (!row) throw notFound("TARGET_NOT_FOUND", "That content no longer exists");
  if (row.status !== "approved") {
    throw badRequest("TARGET_UNAVAILABLE", "You can't comment on this right now");
  }
}

export async function getCommentById(db: DB, id: string, viewerId?: string) {
  const [row] = await db
    .select(baseSelect)
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.id, id))
    .limit(1);
  if (!row) throw notFound("COMMENT_NOT_FOUND", "Comment not found");
  return shape(row as Record<string, unknown>, viewerId);
}

export async function listComments(
  db: DB,
  targetType: TargetType,
  targetId: string,
  page: PageParams,
  viewerId?: string,
) {
  const where = and(
    eq(comments.targetType, targetType),
    eq(comments.targetId, targetId),
    eq(comments.status, "approved"),
  );
  const [rows, [countRow]] = await Promise.all([
    db
      .select(baseSelect)
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(where)
      .orderBy(asc(comments.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(comments).where(where),
  ]);

  return paginated(
    rows.map((r) => shape(r as Record<string, unknown>, viewerId)),
    countRow?.n ?? 0,
    page,
  );
}

export async function createComment(
  db: DB,
  userId: string,
  input: { targetType: TargetType; targetId: string; body: string; contentLang?: "bn" | "en" },
) {
  await assertTarget(db, input.targetType, input.targetId);
  const [row] = await db
    .insert(comments)
    .values({
      targetType: input.targetType,
      targetId: input.targetId,
      userId,
      body: input.body,
      contentLang: input.contentLang ?? "en",
      status: "approved",
    })
    .returning({ id: comments.id });
  return getCommentById(db, row!.id, userId);
}

export async function deleteComment(
  db: DB,
  id: string,
  userId: string,
  isPrivileged: boolean,
) {
  const [row] = await db
    .select({ id: comments.id, userId: comments.userId })
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  if (!row) throw notFound("COMMENT_NOT_FOUND", "Comment not found");
  if (row.userId !== userId && !isPrivileged) throw forbidden();
  await db.delete(comments).where(eq(comments.id, id));
}
