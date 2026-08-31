import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { answers, products, questions, users } from "../../db/schema";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { notify } from "../../lib/notify";
import { paginated, type PageParams } from "../../lib/pagination";
import { reputationScore } from "../../lib/reputation";

function person(row: Record<string, unknown>) {
  return {
    id: row.authorId as string,
    name: (row.authorName ?? null) as string | null,
    avatarUrl: (row.authorAvatar ?? null) as string | null,
    reputation: reputationScore({
      reviews: (row.authorReviews ?? 0) as number,
      problems: (row.authorProblems ?? 0) as number,
      solutions: (row.authorSolutions ?? 0) as number,
      helpfulReceived: (row.authorHelpful ?? 0) as number,
    }),
  };
}

const authorCols = {
  authorId: users.id,
  authorName: users.name,
  authorAvatar: users.avatarUrl,
  authorReviews: users.reviewCount,
  authorProblems: users.problemCount,
  authorSolutions: users.solutionCount,
  authorHelpful: users.helpfulReceived,
};

async function recomputeAnswerCount(db: DB, questionId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(answers)
    .where(and(eq(answers.questionId, questionId), eq(answers.status, "approved")));
  await db
    .update(questions)
    .set({ answerCount: row?.n ?? 0, updatedAt: new Date() })
    .where(eq(questions.id, questionId));
}

async function loadAnswers(
  db: DB,
  questionIds: string[],
  acceptedMap: Map<string, string | null>,
  viewerId?: string,
) {
  const map = new Map<string, ReturnType<typeof shapeAnswer>[]>();
  if (questionIds.length === 0) return map;

  const rows = await db
    .select({
      id: answers.id,
      questionId: answers.questionId,
      body: answers.body,
      contentLang: answers.contentLang,
      createdAt: answers.createdAt,
      userId: answers.userId,
      ...authorCols,
    })
    .from(answers)
    .innerJoin(users, eq(answers.userId, users.id))
    .where(and(inArray(answers.questionId, questionIds), eq(answers.status, "approved")))
    .orderBy(asc(answers.createdAt));

  function shapeAnswer(r: (typeof rows)[number]) {
    return {
      id: r.id,
      questionId: r.questionId,
      body: r.body,
      contentLang: r.contentLang,
      createdAt: r.createdAt,
      author: person(r as unknown as Record<string, unknown>),
      isAccepted: acceptedMap.get(r.questionId) === r.id,
      viewerCanEdit: viewerId != null && r.userId === viewerId,
    };
  }

  for (const r of rows) {
    const arr = map.get(r.questionId) ?? [];
    arr.push(shapeAnswer(r));
    map.set(r.questionId, arr);
  }
  // accepted answer floats to the top
  for (const [qid, arr] of map) {
    arr.sort((a, b) => Number(b.isAccepted) - Number(a.isAccepted));
    map.set(qid, arr);
  }
  return map;
}

export async function getQuestion(db: DB, id: string, viewerId?: string) {
  const [q] = await db
    .select({
      id: questions.id,
      productId: questions.productId,
      body: questions.body,
      contentLang: questions.contentLang,
      createdAt: questions.createdAt,
      answerCount: questions.answerCount,
      acceptedAnswerId: questions.acceptedAnswerId,
      userId: questions.userId,
      ...authorCols,
    })
    .from(questions)
    .innerJoin(users, eq(questions.userId, users.id))
    .where(eq(questions.id, id))
    .limit(1);
  if (!q) throw notFound("QUESTION_NOT_FOUND", "Question not found");

  const answerMap = await loadAnswers(
    db,
    [q.id],
    new Map([[q.id, q.acceptedAnswerId]]),
    viewerId,
  );

  return {
    id: q.id,
    productId: q.productId,
    body: q.body,
    contentLang: q.contentLang,
    createdAt: q.createdAt,
    answerCount: q.answerCount,
    author: person(q as unknown as Record<string, unknown>),
    viewerCanEdit: viewerId != null && q.userId === viewerId,
    viewerIsAsker: viewerId != null && q.userId === viewerId,
    answers: answerMap.get(q.id) ?? [],
  };
}

export async function listQuestions(
  db: DB,
  productId: string,
  page: PageParams,
  viewerId?: string,
) {
  const where = and(eq(questions.productId, productId), eq(questions.status, "approved"));
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: questions.id,
        productId: questions.productId,
        body: questions.body,
        contentLang: questions.contentLang,
        createdAt: questions.createdAt,
        answerCount: questions.answerCount,
        acceptedAnswerId: questions.acceptedAnswerId,
        userId: questions.userId,
        ...authorCols,
      })
      .from(questions)
      .innerJoin(users, eq(questions.userId, users.id))
      .where(where)
      .orderBy(desc(questions.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(questions).where(where),
  ]);

  const acceptedMap = new Map(rows.map((r) => [r.id, r.acceptedAnswerId]));
  const answerMap = await loadAnswers(
    db,
    rows.map((r) => r.id),
    acceptedMap,
    viewerId,
  );

  const data = rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    body: r.body,
    contentLang: r.contentLang,
    createdAt: r.createdAt,
    answerCount: r.answerCount,
    author: person(r as unknown as Record<string, unknown>),
    viewerCanEdit: viewerId != null && r.userId === viewerId,
    viewerIsAsker: viewerId != null && r.userId === viewerId,
    answers: answerMap.get(r.id) ?? [],
  }));

  return paginated(data, countRow?.n ?? 0, page);
}

export async function createQuestion(
  db: DB,
  productId: string,
  userId: string,
  body: string,
) {
  const [prod] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!prod) throw notFound("PRODUCT_NOT_FOUND", "Product not found");

  const [row] = await db
    .insert(questions)
    .values({ productId, userId, body, status: "approved" })
    .returning({ id: questions.id });
  return getQuestion(db, row!.id, userId);
}

export async function deleteQuestion(
  db: DB,
  id: string,
  userId: string,
  isPrivileged: boolean,
) {
  const [row] = await db
    .select({ id: questions.id, userId: questions.userId })
    .from(questions)
    .where(eq(questions.id, id))
    .limit(1);
  if (!row) throw notFound("QUESTION_NOT_FOUND", "Question not found");
  if (row.userId !== userId && !isPrivileged) throw forbidden();
  await db.delete(questions).where(eq(questions.id, id));
}

export async function createAnswer(
  db: DB,
  questionId: string,
  userId: string,
  body: string,
) {
  const [q] = await db
    .select({
      id: questions.id,
      status: questions.status,
      askerId: questions.userId,
      productSlug: products.slug,
      productName: products.name,
    })
    .from(questions)
    .innerJoin(products, eq(questions.productId, products.id))
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!q) throw notFound("QUESTION_NOT_FOUND", "Question not found");
  if (q.status !== "approved") throw badRequest("QUESTION_UNAVAILABLE", "Question is unavailable");

  await db.insert(answers).values({ questionId, userId, body, status: "approved" });
  await recomputeAnswerCount(db, questionId);

  await notify(db, {
    userIds: [q.askerId],
    actorId: userId,
    type: "answer_received",
    target: { type: "product", id: questionId },
    meta: { href: `/products/${q.productSlug}`, title: q.productName },
  });

  return getQuestion(db, questionId, userId);
}

export async function deleteAnswer(
  db: DB,
  id: string,
  userId: string,
  isPrivileged: boolean,
) {
  const [row] = await db
    .select({ id: answers.id, userId: answers.userId, questionId: answers.questionId })
    .from(answers)
    .where(eq(answers.id, id))
    .limit(1);
  if (!row) throw notFound("ANSWER_NOT_FOUND", "Answer not found");
  if (row.userId !== userId && !isPrivileged) throw forbidden();

  await db.delete(answers).where(eq(answers.id, id));
  await recomputeAnswerCount(db, row.questionId);
  await db
    .update(questions)
    .set({ acceptedAnswerId: null })
    .where(and(eq(questions.id, row.questionId), eq(questions.acceptedAnswerId, id)));

  return getQuestion(db, row.questionId, userId);
}

export async function acceptAnswer(
  db: DB,
  questionId: string,
  userId: string,
  answerId: string | null,
) {
  const [q] = await db
    .select({ id: questions.id, userId: questions.userId })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!q) throw notFound("QUESTION_NOT_FOUND", "Question not found");
  if (q.userId !== userId) throw forbidden("Only the person who asked can accept an answer");

  if (answerId) {
    const [a] = await db
      .select({ id: answers.id })
      .from(answers)
      .where(and(eq(answers.id, answerId), eq(answers.questionId, questionId)))
      .limit(1);
    if (!a) throw badRequest("ANSWER_MISMATCH", "That answer is not on this question");
  }

  await db
    .update(questions)
    .set({ acceptedAnswerId: answerId, updatedAt: new Date() })
    .where(eq(questions.id, questionId));

  return getQuestion(db, questionId, userId);
}

export async function listMyQuestions(db: DB, userId: string, page: PageParams) {
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: questions.id,
        productId: questions.productId,
        body: questions.body,
        contentLang: questions.contentLang,
        createdAt: questions.createdAt,
        answerCount: questions.answerCount,
        acceptedAnswerId: questions.acceptedAnswerId,
        userId: questions.userId,
        productSlug: products.slug,
        productName: products.name,
        productImage: products.primaryImage,
        ...authorCols,
      })
      .from(questions)
      .innerJoin(users, eq(questions.userId, users.id))
      .innerJoin(products, eq(questions.productId, products.id))
      .where(eq(questions.userId, userId))
      .orderBy(desc(questions.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(questions).where(eq(questions.userId, userId)),
  ]);

  const acceptedMap = new Map(rows.map((r) => [r.id, r.acceptedAnswerId]));
  const answerMap = await loadAnswers(
    db,
    rows.map((r) => r.id),
    acceptedMap,
    userId,
  );

  const data = rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    body: r.body,
    contentLang: r.contentLang,
    createdAt: r.createdAt,
    answerCount: r.answerCount,
    author: person(r as unknown as Record<string, unknown>),
    viewerCanEdit: true,
    viewerIsAsker: true,
    answers: answerMap.get(r.id) ?? [],
    product: {
      id: r.productId,
      slug: r.productSlug,
      name: r.productName,
      primaryImage: r.productImage,
    },
  }));

  return paginated(data, countRow?.n ?? 0, page);
}
