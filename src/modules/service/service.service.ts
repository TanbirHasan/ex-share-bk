import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { products, serviceExperiences, users } from "../../db/schema";
import { conflict, forbidden, notFound } from "../../lib/errors";
import { paginated, type PageParams } from "../../lib/pagination";
import type { CreateServiceInput, ListServiceQuery, UpdateServiceInput } from "./service.schema";

const baseSelect = {
  ...getTableColumns(serviceExperiences),
  authorId: users.id,
  authorName: users.name,
  authorAvatar: users.avatarUrl,
};

type ResponseTime = "same_day" | "within_3_days" | "within_a_week" | "over_a_week" | "no_response";
type Channel = "phone" | "email" | "service_center" | "home_visit" | "social_media" | "other";
type RepairOutcome = "fixed" | "partly_fixed" | "not_fixed" | "replaced" | "refunded" | "pending";
type Warranty = "yes" | "no" | "partial" | "unsure";

function shape(row: Record<string, unknown>, viewerId?: string) {
  return {
    id: row.id as string,
    productId: row.productId as string,
    rating: row.rating as number,
    responseTime: row.responseTime as ResponseTime,
    channel: row.channel as Channel,
    repairOutcome: row.repairOutcome as RepairOutcome,
    warranty: row.warranty as Warranty,
    technicianRating: (row.technicianRating ?? null) as number | null,
    issue: (row.issue ?? null) as string | null,
    cost: (row.cost ?? null) as number | null,
    durationDays: (row.durationDays ?? null) as number | null,
    comment: (row.comment ?? null) as string | null,
    contentLang: row.contentLang as "bn" | "en",
    status: row.status as "pending" | "approved" | "rejected",
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    author: {
      id: row.authorId as string,
      name: (row.authorName ?? null) as string | null,
      avatarUrl: (row.authorAvatar ?? null) as string | null,
    },
    viewerCanEdit: viewerId != null && row.userId === viewerId,
  };
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

async function computeSummary(db: DB, productId: string) {
  const rows = await db
    .select({
      rating: serviceExperiences.rating,
      technicianRating: serviceExperiences.technicianRating,
      responseTime: serviceExperiences.responseTime,
      repairOutcome: serviceExperiences.repairOutcome,
      warranty: serviceExperiences.warranty,
      cost: serviceExperiences.cost,
      durationDays: serviceExperiences.durationDays,
    })
    .from(serviceExperiences)
    .where(
      and(eq(serviceExperiences.productId, productId), eq(serviceExperiences.status, "approved")),
    );

  const count = rows.length;
  if (count === 0) {
    return {
      count: 0,
      avgRating: 0,
      avgTechnicianRating: null,
      recommendedRate: 0,
      responseTime: {},
      repairOutcome: {},
      warranty: {},
      medianCost: null,
      medianDurationDays: null,
    };
  }

  const tech = rows.map((r) => r.technicianRating).filter((v): v is number => typeof v === "number");
  const bump = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1);
  const responseTime: Record<string, number> = {};
  const repairOutcome: Record<string, number> = {};
  const warranty: Record<string, number> = {};
  for (const r of rows) {
    bump(responseTime, r.responseTime);
    bump(repairOutcome, r.repairOutcome);
    bump(warranty, r.warranty);
  }

  return {
    count,
    avgRating: Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10,
    avgTechnicianRating: tech.length
      ? Math.round((tech.reduce((s, v) => s + v, 0) / tech.length) * 10) / 10
      : null,
    recommendedRate: Math.round((100 * rows.filter((r) => r.rating >= 4).length) / count),
    responseTime,
    repairOutcome,
    warranty,
    medianCost: median(rows.map((r) => r.cost).filter((v): v is number => typeof v === "number")),
    medianDurationDays: median(
      rows.map((r) => r.durationDays).filter((v): v is number => typeof v === "number"),
    ),
  };
}

export async function getServiceById(db: DB, id: string, viewerId?: string) {
  const [row] = await db
    .select(baseSelect)
    .from(serviceExperiences)
    .innerJoin(users, eq(serviceExperiences.userId, users.id))
    .where(eq(serviceExperiences.id, id))
    .limit(1);
  if (!row) throw notFound("SERVICE_NOT_FOUND", "Service experience not found");
  return shape(row as Record<string, unknown>, viewerId);
}

export async function listServiceExperiences(
  db: DB,
  productId: string,
  query: ListServiceQuery,
  viewerId?: string,
) {
  const where = and(
    eq(serviceExperiences.productId, productId),
    eq(serviceExperiences.status, "approved"),
  );
  const page: PageParams = { limit: query.limit, offset: query.offset };
  const orderBy =
    query.sort === "rating"
      ? [desc(serviceExperiences.rating), desc(serviceExperiences.createdAt)]
      : [desc(serviceExperiences.createdAt)];

  const [rows, [countRow], summary] = await Promise.all([
    db
      .select(baseSelect)
      .from(serviceExperiences)
      .innerJoin(users, eq(serviceExperiences.userId, users.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(serviceExperiences).where(where),
    computeSummary(db, productId),
  ]);

  const list = paginated(
    rows.map((r) => shape(r as Record<string, unknown>, viewerId)),
    countRow?.n ?? 0,
    page,
  );
  return { ...list, summary };
}

export async function getMyServiceExperience(db: DB, productId: string, userId: string) {
  const [row] = await db
    .select(baseSelect)
    .from(serviceExperiences)
    .innerJoin(users, eq(serviceExperiences.userId, users.id))
    .where(
      and(eq(serviceExperiences.productId, productId), eq(serviceExperiences.userId, userId)),
    )
    .limit(1);
  return row ? shape(row as Record<string, unknown>, userId) : null;
}

export async function listMyServiceExperiences(db: DB, userId: string, page: PageParams) {
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        ...baseSelect,
        productSlug: products.slug,
        productName: products.name,
        productImage: products.primaryImage,
      })
      .from(serviceExperiences)
      .innerJoin(users, eq(serviceExperiences.userId, users.id))
      .innerJoin(products, eq(serviceExperiences.productId, products.id))
      .where(eq(serviceExperiences.userId, userId))
      .orderBy(desc(serviceExperiences.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(serviceExperiences)
      .where(eq(serviceExperiences.userId, userId)),
  ]);

  const data = rows.map((r) => ({
    ...shape(r as Record<string, unknown>, userId),
    product: {
      id: r.productId as string,
      slug: r.productSlug as string,
      name: r.productName as string,
      primaryImage: (r.productImage ?? null) as string | null,
    },
  }));
  return paginated(data, countRow?.n ?? 0, page);
}

export async function createServiceExperience(
  db: DB,
  productId: string,
  userId: string,
  input: CreateServiceInput,
) {
  const [prod] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!prod) throw notFound("PRODUCT_NOT_FOUND", "Product not found");

  const [dup] = await db
    .select({ id: serviceExperiences.id })
    .from(serviceExperiences)
    .where(
      and(eq(serviceExperiences.productId, productId), eq(serviceExperiences.userId, userId)),
    )
    .limit(1);
  if (dup) {
    throw conflict(
      "SERVICE_EXISTS",
      "You've already shared a service experience for this product. Edit it instead.",
    );
  }

  const [row] = await db
    .insert(serviceExperiences)
    .values({
      productId,
      userId,
      rating: input.rating,
      responseTime: input.responseTime,
      channel: input.channel,
      repairOutcome: input.repairOutcome,
      warranty: input.warranty,
      technicianRating: input.technicianRating ?? null,
      issue: input.issue ?? null,
      cost: input.cost ?? null,
      durationDays: input.durationDays ?? null,
      comment: input.comment ?? null,
      contentLang: input.contentLang ?? "en",
      status: "approved",
    })
    .returning({ id: serviceExperiences.id });

  return getServiceById(db, row!.id, userId);
}

export async function updateServiceExperience(
  db: DB,
  id: string,
  userId: string,
  isPrivileged: boolean,
  input: UpdateServiceInput,
) {
  const [existing] = await db
    .select({ id: serviceExperiences.id, userId: serviceExperiences.userId })
    .from(serviceExperiences)
    .where(eq(serviceExperiences.id, id))
    .limit(1);
  if (!existing) throw notFound("SERVICE_NOT_FOUND", "Service experience not found");
  if (existing.userId !== userId && !isPrivileged) throw forbidden();

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of [
    "rating",
    "responseTime",
    "channel",
    "repairOutcome",
    "warranty",
    "contentLang",
  ] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  for (const key of ["technicianRating", "issue", "cost", "durationDays", "comment"] as const) {
    if (input[key] !== undefined) patch[key] = input[key] ?? null;
  }

  await db.update(serviceExperiences).set(patch).where(eq(serviceExperiences.id, id));
  return getServiceById(db, id, userId);
}

export async function deleteServiceExperience(
  db: DB,
  id: string,
  userId: string,
  isPrivileged: boolean,
) {
  const [existing] = await db
    .select({ id: serviceExperiences.id, userId: serviceExperiences.userId })
    .from(serviceExperiences)
    .where(eq(serviceExperiences.id, id))
    .limit(1);
  if (!existing) throw notFound("SERVICE_NOT_FOUND", "Service experience not found");
  if (existing.userId !== userId && !isPrivileged) throw forbidden();
  await db.delete(serviceExperiences).where(eq(serviceExperiences.id, id));
}
