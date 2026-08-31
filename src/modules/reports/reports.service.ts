import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import {
  auditLog,
  contentReports,
  problems,
  products,
  reviews,
  solutions,
  users,
} from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { notify } from "../../lib/notify";
import { paginated, type PageParams } from "../../lib/pagination";
import { recomputeProductAggregates } from "../reviews/reviews.service";
import type { CreateReportInput } from "./reports.schema";

type TargetType = "review" | "problem" | "solution";

type TargetInfo = {
  exists: boolean;
  snippet: string;
  status: string | null;
  authorName: string | null;
  href: string | null;
  productName: string | null;
  productId: string | null;
};

const MISSING: TargetInfo = {
  exists: false,
  snippet: "(deleted)",
  status: null,
  authorName: null,
  href: null,
  productName: null,
  productId: null,
};

function trim(s: string | null, n = 160): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function loadTargets(db: DB, type: TargetType, ids: string[]) {
  const map = new Map<string, TargetInfo>();
  if (ids.length === 0) return map;

  if (type === "review") {
    const rows = await db
      .select({
        id: reviews.id,
        comment: reviews.comment,
        rating: reviews.rating,
        status: reviews.status,
        author: users.name,
        productSlug: products.slug,
        productName: products.name,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .innerJoin(products, eq(reviews.productId, products.id))
      .where(inArray(reviews.id, ids));
    for (const r of rows) {
      map.set(r.id, {
        exists: true,
        snippet: trim(r.comment) || `${r.rating}★ review`,
        status: r.status,
        authorName: r.author,
        href: `/products/${r.productSlug}`,
        productName: r.productName,
        productId: null,
      });
    }
  } else if (type === "problem") {
    const rows = await db
      .select({
        id: problems.id,
        slug: problems.slug,
        title: problems.title,
        status: problems.status,
        author: users.name,
        productName: products.name,
      })
      .from(problems)
      .leftJoin(users, eq(problems.createdBy, users.id))
      .innerJoin(products, eq(problems.productId, products.id))
      .where(inArray(problems.id, ids));
    for (const r of rows) {
      map.set(r.id, {
        exists: true,
        snippet: trim(r.title),
        status: r.status,
        authorName: r.author,
        href: `/problems/${r.slug}`,
        productName: r.productName,
        productId: null,
      });
    }
  } else {
    const rows = await db
      .select({
        id: solutions.id,
        body: solutions.body,
        status: solutions.status,
        author: users.name,
        problemSlug: problems.slug,
        productName: products.name,
      })
      .from(solutions)
      .innerJoin(users, eq(solutions.userId, users.id))
      .innerJoin(problems, eq(solutions.problemId, problems.id))
      .innerJoin(products, eq(problems.productId, products.id))
      .where(inArray(solutions.id, ids));
    for (const r of rows) {
      map.set(r.id, {
        exists: true,
        snippet: trim(r.body),
        status: r.status,
        authorName: r.author,
        href: `/problems/${r.problemSlug}`,
        productName: r.productName,
        productId: null,
      });
    }
  }
  return map;
}

async function targetExists(db: DB, type: TargetType, id: string) {
  const table = type === "review" ? reviews : type === "problem" ? problems : solutions;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  return Boolean(row);
}

// --- user: create a report ---------------------------------------------------

export async function createReport(db: DB, reporterId: string, input: CreateReportInput) {
  if (!(await targetExists(db, input.targetType, input.targetId))) {
    throw notFound("TARGET_NOT_FOUND", "That content no longer exists");
  }

  const [dup] = await db
    .select({ id: contentReports.id })
    .from(contentReports)
    .where(
      and(
        eq(contentReports.reporterId, reporterId),
        eq(contentReports.targetType, input.targetType),
        eq(contentReports.targetId, input.targetId),
        eq(contentReports.status, "open"),
      ),
    )
    .limit(1);
  if (dup) return { ok: true, alreadyReported: true };

  const reason = input.detail ? `${input.reason} — ${input.detail}` : input.reason;
  await db.insert(contentReports).values({
    reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason,
    status: "open",
  });
  return { ok: true, alreadyReported: false };
}

// --- admin: list + resolve -------------------------------------------------------

export async function listReports(
  db: DB,
  status: "open" | "reviewing" | "actioned" | "dismissed",
  page: PageParams,
) {
  const where = eq(contentReports.status, status);
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: contentReports.id,
        targetType: contentReports.targetType,
        targetId: contentReports.targetId,
        reason: contentReports.reason,
        status: contentReports.status,
        createdAt: contentReports.createdAt,
        reporterId: users.id,
        reporterName: users.name,
      })
      .from(contentReports)
      .innerJoin(users, eq(contentReports.reporterId, users.id))
      .where(where)
      .orderBy(desc(contentReports.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(contentReports).where(where),
  ]);

  const byType: Record<TargetType, string[]> = { review: [], problem: [], solution: [] };
  for (const r of rows) byType[r.targetType as TargetType].push(r.targetId);

  const [reviewT, problemT, solutionT] = await Promise.all([
    loadTargets(db, "review", byType.review),
    loadTargets(db, "problem", byType.problem),
    loadTargets(db, "solution", byType.solution),
  ]);
  const targets = { review: reviewT, problem: problemT, solution: solutionT };

  // total reports per (type,id) for the visible rows
  const counts = new Map<string, number>();
  if (rows.length) {
    const countRows = await db
      .select({
        targetType: contentReports.targetType,
        targetId: contentReports.targetId,
        n: sql<number>`count(*)::int`,
      })
      .from(contentReports)
      .where(
        inArray(
          contentReports.targetId,
          rows.map((r) => r.targetId),
        ),
      )
      .groupBy(contentReports.targetType, contentReports.targetId);
    for (const c of countRows) counts.set(`${c.targetType}:${c.targetId}`, c.n);
  }

  const data = rows.map((r) => {
    const info = targets[r.targetType as TargetType].get(r.targetId) ?? MISSING;
    return {
      id: r.id,
      targetType: r.targetType as TargetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status as "open" | "reviewing" | "actioned" | "dismissed",
      createdAt: r.createdAt,
      reporter: { id: r.reporterId, name: r.reporterName },
      reportCount: counts.get(`${r.targetType}:${r.targetId}`) ?? 1,
      target: {
        exists: info.exists,
        snippet: info.snippet,
        status: info.status,
        authorName: info.authorName,
        href: info.href,
        productName: info.productName,
      },
    };
  });

  return paginated(data, countRow?.n ?? 0, page);
}

export async function resolveReport(
  db: DB,
  actorId: string,
  reportId: string,
  resolution: "dismiss" | "remove_content" | "keep_content",
  ip: string | null,
) {
  const [report] = await db
    .select()
    .from(contentReports)
    .where(eq(contentReports.id, reportId))
    .limit(1);
  if (!report) throw notFound("REPORT_NOT_FOUND", "Report not found");

  const type = report.targetType as TargetType;
  if (type !== "review" && type !== "problem" && type !== "solution") {
    throw badRequest("UNSUPPORTED_TARGET", "This report type can't be actioned here");
  }
  const table = type === "review" ? reviews : type === "problem" ? problems : solutions;

  if (resolution === "dismiss") {
    await db
      .update(contentReports)
      .set({ status: "dismissed" })
      .where(eq(contentReports.id, reportId));
  } else {
    const newStatus = resolution === "remove_content" ? "rejected" : "approved";
    await db
      .update(table)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(table.id, report.targetId));

    await db
      .update(contentReports)
      .set({ status: "actioned" })
      .where(
        and(
          eq(contentReports.targetType, report.targetType),
          eq(contentReports.targetId, report.targetId),
          ne(contentReports.status, "actioned"),
        ),
      );

    if (type === "review") {
      const [row] = await db
        .select({ productId: reviews.productId })
        .from(reviews)
        .where(eq(reviews.id, report.targetId))
        .limit(1);
      if (row) await recomputeProductAggregates(db, row.productId);
    }

    if (resolution === "remove_content") {
      let ownerId: string | null = null;
      if (type === "review") {
        const [row] = await db
          .select({ userId: reviews.userId })
          .from(reviews)
          .where(eq(reviews.id, report.targetId))
          .limit(1);
        ownerId = row?.userId ?? null;
      } else if (type === "solution") {
        const [row] = await db
          .select({ userId: solutions.userId })
          .from(solutions)
          .where(eq(solutions.id, report.targetId))
          .limit(1);
        ownerId = row?.userId ?? null;
      } else {
        const [row] = await db
          .select({ userId: problems.createdBy })
          .from(problems)
          .where(eq(problems.id, report.targetId))
          .limit(1);
        ownerId = row?.userId ?? null;
      }
      if (ownerId) {
        await notify(db, {
          userIds: [ownerId],
          type: "content_removed",
          target: { type, id: report.targetId },
          meta: { kind: type, href: `/dashboard/${type}s` },
        });
      }
    }
  }

  await db.insert(auditLog).values({
    actorId,
    action: `report_${resolution}`,
    targetType: report.targetType,
    targetId: report.targetId,
    meta: { reportId, reason: report.reason },
    ip,
  });

  return { ok: true };
}
