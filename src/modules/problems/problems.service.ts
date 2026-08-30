import { and, desc, eq, getTableColumns, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "../../db/client";
import {
  problemReports,
  problems,
  products,
  solutionConfirmations,
  solutions,
  users,
  votes,
} from "../../db/schema";
import { conflict, forbidden, notFound } from "../../lib/errors";
import { paginated, type PageParams } from "../../lib/pagination";
import { slugify, slugSuffix } from "../../lib/slug";
import type {
  AddReportInput,
  CreateProblemInput,
  CreateSolutionInput,
  ListProblemsQuery,
} from "./problems.schema";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const productRef = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  primaryImage: products.primaryImage,
};

const solutionCountSql = sql<number>`(
  select count(*)::int from ${solutions} s
  where s.problem_id = ${problems.id} and s.status = 'approved'
)`;

// --- recompute helpers ----------------------------------------------------------

async function recomputeReportCount(tx: Tx, problemId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(problemReports)
    .where(eq(problemReports.problemId, problemId));
  await tx
    .update(problems)
    .set({ reportCount: row?.n ?? 0, updatedAt: new Date() })
    .where(eq(problems.id, problemId));
}

async function recomputeConfirmations(tx: Tx, solutionId: string) {
  const rows = await tx
    .select({ worked: solutionConfirmations.worked })
    .from(solutionConfirmations)
    .where(eq(solutionConfirmations.solutionId, solutionId));
  const worked = rows.filter((r) => r.worked).length;
  await tx
    .update(solutions)
    .set({ workedCount: worked, didntWorkCount: rows.length - worked, updatedAt: new Date() })
    .where(eq(solutions.id, solutionId));
}

async function recomputeSolutionHelpful(tx: Tx, solutionId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(votes)
    .where(and(eq(votes.targetType, "solution"), eq(votes.targetId, solutionId)));
  await tx.update(solutions).set({ helpfulCount: row?.n ?? 0 }).where(eq(solutions.id, solutionId));
}

async function recomputeUserProblemCount(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(distinct ${problemReports.problemId})::int` })
    .from(problemReports)
    .where(eq(problemReports.userId, userId));
  await tx.update(users).set({ problemCount: row?.n ?? 0 }).where(eq(users.id, userId));
}

async function recomputeUserSolutionCount(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(solutions)
    .where(and(eq(solutions.userId, userId), eq(solutions.status, "approved")));
  await tx.update(users).set({ solutionCount: row?.n ?? 0 }).where(eq(users.id, userId));
}

// --- solutions read -----------------------------------------------------------

async function loadSolutions(db: DB, problemId: string, viewerId?: string) {
  const rows = await db
    .select({
      id: solutions.id,
      problemId: solutions.problemId,
      body: solutions.body,
      contentLang: solutions.contentLang,
      workedCount: solutions.workedCount,
      didntWorkCount: solutions.didntWorkCount,
      helpfulCount: solutions.helpfulCount,
      createdAt: solutions.createdAt,
      updatedAt: solutions.updatedAt,
      userId: solutions.userId,
      authorId: users.id,
      authorName: users.name,
      authorAvatar: users.avatarUrl,
    })
    .from(solutions)
    .innerJoin(users, eq(solutions.userId, users.id))
    .where(and(eq(solutions.problemId, problemId), eq(solutions.status, "approved")))
    .orderBy(
      desc(solutions.workedCount),
      desc(solutions.helpfulCount),
      desc(solutions.createdAt),
    );

  const ids = rows.map((r) => r.id);
  const confirmed = new Map<string, boolean>();
  const voted = new Set<string>();
  if (viewerId && ids.length) {
    const [confs, vts] = await Promise.all([
      db
        .select({ solutionId: solutionConfirmations.solutionId, worked: solutionConfirmations.worked })
        .from(solutionConfirmations)
        .where(
          and(
            eq(solutionConfirmations.userId, viewerId),
            inArray(solutionConfirmations.solutionId, ids),
          ),
        ),
      db
        .select({ targetId: votes.targetId })
        .from(votes)
        .where(
          and(
            eq(votes.userId, viewerId),
            eq(votes.targetType, "solution"),
            inArray(votes.targetId, ids),
          ),
        ),
    ]);
    for (const c of confs) confirmed.set(c.solutionId, c.worked);
    for (const v of vts) voted.add(v.targetId);
  }

  return rows.map((r) => ({
    id: r.id,
    problemId: r.problemId,
    body: r.body,
    contentLang: r.contentLang,
    workedCount: r.workedCount,
    didntWorkCount: r.didntWorkCount,
    helpfulCount: r.helpfulCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    author: { id: r.authorId, name: r.authorName, avatarUrl: r.authorAvatar },
    viewerConfirmed: confirmed.has(r.id)
      ? confirmed.get(r.id)
        ? ("worked" as const)
        : ("didnt" as const)
      : ("none" as const),
    viewerHasVoted: voted.has(r.id),
    viewerCanEdit: viewerId != null && r.userId === viewerId,
  }));
}

// --- problems read ----------------------------------------------------------

export async function listProblems(db: DB, query: ListProblemsQuery) {
  const filters: SQL[] = [eq(problems.status, "approved")];
  if (query.category) filters.push(eq(problems.category, query.category));
  if (query.productId) filters.push(eq(problems.productId, query.productId));
  if (query.q) {
    const like = `%${query.q}%`;
    filters.push(or(ilike(problems.title, like), ilike(problems.description, like))!);
  }
  const where = and(...filters);
  const page: PageParams = { limit: query.limit, offset: query.offset };
  const orderBy =
    query.sort === "recent"
      ? [desc(problems.createdAt)]
      : [desc(problems.reportCount), desc(problems.createdAt)];

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: problems.id,
        slug: problems.slug,
        category: problems.category,
        title: problems.title,
        description: problems.description,
        reportCount: problems.reportCount,
        solutionCount: solutionCountSql,
        createdAt: problems.createdAt,
        product: productRef,
      })
      .from(problems)
      .innerJoin(products, eq(problems.productId, products.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(problems).where(where),
  ]);

  return paginated(rows, countRow?.n ?? 0, page);
}

export async function listProductProblems(db: DB, productId: string, page: PageParams) {
  const where = and(eq(problems.productId, productId), eq(problems.status, "approved"));
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: problems.id,
        slug: problems.slug,
        category: problems.category,
        title: problems.title,
        description: problems.description,
        reportCount: problems.reportCount,
        solutionCount: solutionCountSql,
        createdAt: problems.createdAt,
        product: productRef,
      })
      .from(problems)
      .innerJoin(products, eq(problems.productId, products.id))
      .where(where)
      .orderBy(desc(problems.reportCount), desc(problems.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(problems).where(where),
  ]);
  return paginated(rows, countRow?.n ?? 0, page);
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

export async function getProblemBySlug(db: DB, slug: string, viewerId?: string) {
  const [row] = await db
    .select({
      id: problems.id,
      slug: problems.slug,
      category: problems.category,
      title: problems.title,
      description: problems.description,
      reportCount: problems.reportCount,
      createdAt: problems.createdAt,
      createdBy: problems.createdBy,
      product: productRef,
      reporterId: users.id,
      reporterName: users.name,
      reporterAvatar: users.avatarUrl,
    })
    .from(problems)
    .innerJoin(products, eq(problems.productId, products.id))
    .leftJoin(users, eq(problems.createdBy, users.id))
    .where(eq(problems.slug, slug))
    .limit(1);
  if (!row) throw notFound("PROBLEM_NOT_FOUND", "Problem not found");

  const reports = await db
    .select({
      userId: problemReports.userId,
      whenStarted: problemReports.whenStarted,
      warrantyCovered: problemReports.warrantyCovered,
      repairCost: problemReports.repairCost,
    })
    .from(problemReports)
    .where(eq(problemReports.problemId, row.id));

  const whenStarted: Record<string, number> = {};
  const warrantyBreakdown: Record<string, number> = {};
  const costs: number[] = [];
  let viewerHasReported = false;
  for (const r of reports) {
    if (r.userId === viewerId) viewerHasReported = true;
    if (r.whenStarted) whenStarted[r.whenStarted] = (whenStarted[r.whenStarted] ?? 0) + 1;
    if (r.warrantyCovered) {
      warrantyBreakdown[r.warrantyCovered] = (warrantyBreakdown[r.warrantyCovered] ?? 0) + 1;
    }
    if (typeof r.repairCost === "number") costs.push(r.repairCost);
  }

  const solutionList = await loadSolutions(db, row.id, viewerId);

  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    title: row.title,
    description: row.description,
    reportCount: row.reportCount,
    createdAt: row.createdAt,
    product: row.product,
    reporter: row.reporterId
      ? { id: row.reporterId, name: row.reporterName, avatarUrl: row.reporterAvatar }
      : null,
    viewerHasReported,
    whenStarted,
    warrantyBreakdown,
    repairCost: costs.length
      ? {
          min: Math.min(...costs),
          max: Math.max(...costs),
          median: median(costs),
          count: costs.length,
        }
      : null,
    solutions: solutionList,
  };
}

// --- mutations ---------------------------------------------------------------

export async function createProblem(
  db: DB,
  productId: string,
  userId: string,
  input: CreateProblemInput,
) {
  const [prod] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!prod) throw notFound("PRODUCT_NOT_FOUND", "Product not found");

  const created = await db.transaction(async (tx) => {
    let slug = `${slugify(input.title)}-${slugSuffix()}`;
    for (let i = 0; i < 3; i++) {
      const [clash] = await tx
        .select({ id: problems.id })
        .from(problems)
        .where(eq(problems.slug, slug))
        .limit(1);
      if (!clash) break;
      slug = `${slugify(input.title)}-${slugSuffix()}`;
    }

    const [problem] = await tx
      .insert(problems)
      .values({
        productId,
        slug,
        category: input.category,
        title: input.title,
        description: input.description,
        contentLang: input.contentLang ?? "en",
        createdBy: userId,
        status: "approved",
      })
      .returning({ id: problems.id, slug: problems.slug });

    await tx.insert(problemReports).values({
      problemId: problem!.id,
      userId,
      whenStarted: input.report?.whenStarted,
      warrantyCovered: input.report?.warrantyCovered ?? null,
      repairCost: input.report?.repairCost ?? null,
      note: input.report?.note ?? null,
    });

    await recomputeReportCount(tx, problem!.id);
    await recomputeUserProblemCount(tx, userId);
    return problem!;
  });

  return getProblemBySlug(db, created.slug, userId);
}

export async function addReport(
  db: DB,
  problemId: string,
  userId: string,
  input: AddReportInput,
) {
  const [problem] = await db
    .select({ id: problems.id, slug: problems.slug })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);
  if (!problem) throw notFound("PROBLEM_NOT_FOUND", "Problem not found");

  const [dup] = await db
    .select({ id: problemReports.id })
    .from(problemReports)
    .where(and(eq(problemReports.problemId, problemId), eq(problemReports.userId, userId)))
    .limit(1);
  if (dup) throw conflict("ALREADY_REPORTED", "You have already reported this problem.");

  await db.transaction(async (tx) => {
    await tx.insert(problemReports).values({
      problemId,
      userId,
      whenStarted: input.whenStarted,
      warrantyCovered: input.warrantyCovered ?? null,
      repairCost: input.repairCost ?? null,
      note: input.note ?? null,
    });
    await recomputeReportCount(tx, problemId);
    await recomputeUserProblemCount(tx, userId);
  });

  return getProblemBySlug(db, problem.slug, userId);
}

async function solutionSlug(db: DB, solutionId: string) {
  const [row] = await db
    .select({ slug: problems.slug })
    .from(solutions)
    .innerJoin(problems, eq(solutions.problemId, problems.id))
    .where(eq(solutions.id, solutionId))
    .limit(1);
  return row?.slug ?? null;
}

export async function createSolution(
  db: DB,
  problemId: string,
  userId: string,
  input: CreateSolutionInput,
) {
  const [problem] = await db
    .select({ id: problems.id, slug: problems.slug })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);
  if (!problem) throw notFound("PROBLEM_NOT_FOUND", "Problem not found");

  await db.transaction(async (tx) => {
    await tx.insert(solutions).values({
      problemId,
      userId,
      body: input.body,
      contentLang: input.contentLang ?? "en",
      status: "approved",
    });
    await recomputeUserSolutionCount(tx, userId);
  });

  return getProblemBySlug(db, problem.slug, userId);
}

export async function updateSolution(
  db: DB,
  solutionId: string,
  userId: string,
  isPrivileged: boolean,
  body: string,
) {
  const [row] = await db
    .select({ id: solutions.id, userId: solutions.userId })
    .from(solutions)
    .where(eq(solutions.id, solutionId))
    .limit(1);
  if (!row) throw notFound("SOLUTION_NOT_FOUND", "Solution not found");
  if (row.userId !== userId && !isPrivileged) throw forbidden();
  await db
    .update(solutions)
    .set({ body, updatedAt: new Date() })
    .where(eq(solutions.id, solutionId));
  const slug = await solutionSlug(db, solutionId);
  return getProblemBySlug(db, slug!, userId);
}

export async function deleteSolution(
  db: DB,
  solutionId: string,
  userId: string,
  isPrivileged: boolean,
) {
  const [row] = await db
    .select({ id: solutions.id, userId: solutions.userId })
    .from(solutions)
    .where(eq(solutions.id, solutionId))
    .limit(1);
  if (!row) throw notFound("SOLUTION_NOT_FOUND", "Solution not found");
  if (row.userId !== userId && !isPrivileged) throw forbidden();
  await db.transaction(async (tx) => {
    await tx.delete(solutions).where(eq(solutions.id, solutionId));
    await recomputeUserSolutionCount(tx, row.userId);
  });
}

export async function confirmSolution(
  db: DB,
  solutionId: string,
  userId: string,
  worked: boolean | null,
) {
  const slug = await solutionSlug(db, solutionId);
  if (!slug) throw notFound("SOLUTION_NOT_FOUND", "Solution not found");

  await db.transaction(async (tx) => {
    if (worked === null) {
      await tx
        .delete(solutionConfirmations)
        .where(
          and(
            eq(solutionConfirmations.solutionId, solutionId),
            eq(solutionConfirmations.userId, userId),
          ),
        );
    } else {
      await tx
        .insert(solutionConfirmations)
        .values({ solutionId, userId, worked })
        .onConflictDoUpdate({
          target: [solutionConfirmations.solutionId, solutionConfirmations.userId],
          set: { worked },
        });
    }
    await recomputeConfirmations(tx, solutionId);
  });

  return getProblemBySlug(db, slug, userId);
}

export async function voteSolution(
  db: DB,
  solutionId: string,
  userId: string,
  on: boolean,
) {
  const slug = await solutionSlug(db, solutionId);
  if (!slug) throw notFound("SOLUTION_NOT_FOUND", "Solution not found");

  await db.transaction(async (tx) => {
    if (on) {
      await tx
        .insert(votes)
        .values({ userId, targetType: "solution", targetId: solutionId })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(votes)
        .where(
          and(
            eq(votes.userId, userId),
            eq(votes.targetType, "solution"),
            eq(votes.targetId, solutionId),
          ),
        );
    }
    await recomputeSolutionHelpful(tx, solutionId);
  });

  return getProblemBySlug(db, slug, userId);
}

// --- dashboard --------------------------------------------------------------

export async function listMyProblems(db: DB, userId: string, page: PageParams) {
  const reported = db
    .select({ problemId: problemReports.problemId })
    .from(problemReports)
    .where(eq(problemReports.userId, userId));

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: problems.id,
        slug: problems.slug,
        category: problems.category,
        title: problems.title,
        description: problems.description,
        reportCount: problems.reportCount,
        solutionCount: solutionCountSql,
        createdAt: problems.createdAt,
        createdBy: problems.createdBy,
        product: productRef,
      })
      .from(problems)
      .innerJoin(products, eq(problems.productId, products.id))
      .where(inArray(problems.id, reported))
      .orderBy(desc(problems.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(problems)
      .where(inArray(problems.id, reported)),
  ]);

  const data = rows.map(({ createdBy, ...r }) => ({
    ...r,
    viewerIsCreator: createdBy === userId,
  }));
  return paginated(data, countRow?.n ?? 0, page);
}

export async function listMySolutions(db: DB, userId: string, page: PageParams) {
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: solutions.id,
        problemId: solutions.problemId,
        body: solutions.body,
        contentLang: solutions.contentLang,
        workedCount: solutions.workedCount,
        didntWorkCount: solutions.didntWorkCount,
        helpfulCount: solutions.helpfulCount,
        createdAt: solutions.createdAt,
        updatedAt: solutions.updatedAt,
        authorId: users.id,
        authorName: users.name,
        authorAvatar: users.avatarUrl,
        problemSlug: problems.slug,
        problemTitle: problems.title,
        product: productRef,
      })
      .from(solutions)
      .innerJoin(users, eq(solutions.userId, users.id))
      .innerJoin(problems, eq(solutions.problemId, problems.id))
      .innerJoin(products, eq(problems.productId, products.id))
      .where(eq(solutions.userId, userId))
      .orderBy(desc(solutions.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(solutions).where(eq(solutions.userId, userId)),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    problemId: r.problemId,
    body: r.body,
    contentLang: r.contentLang,
    workedCount: r.workedCount,
    didntWorkCount: r.didntWorkCount,
    helpfulCount: r.helpfulCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    author: { id: r.authorId, name: r.authorName, avatarUrl: r.authorAvatar },
    viewerConfirmed: "none" as const,
    viewerHasVoted: false,
    viewerCanEdit: true,
    problem: { id: r.problemId, slug: r.problemSlug, title: r.problemTitle },
    product: r.product,
  }));
  return paginated(data, countRow?.n ?? 0, page);
}
