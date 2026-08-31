import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import {
  pricePoints,
  reviewImages,
  reviews,
  products,
  solutions,
  stores,
  users,
  votes,
} from "../../db/schema";
import { checkContentGate } from "../../lib/account";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { followerIds, notify, notifyOnce } from "../../lib/notify";
import { maybeNotifyPriceDrop } from "../../lib/price-alerts";
import { paginated, type PageParams } from "../../lib/pagination";
import { reputationScore } from "../../lib/reputation";
import { resolveStore } from "../../lib/stores";
import { deleteImageByUrl } from "../../lib/uploads";
import type {
  CreateReviewInput,
  ListReviewsQuery,
  UpdateReviewInput,
} from "./reviews.schema";

const CAT_KEYS = ["reliability", "performance", "value", "after_sales"] as const;

type OwnershipDuration = "lt_3m" | "m3_6" | "m6_12" | "y1_2" | "y2_3" | "gt_3y";
type WouldBuyAgain = "yes" | "maybe" | "no";
type ReviewStatus = "pending" | "approved" | "rejected";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Recompute a product's rating aggregates in its own transaction (for external callers). */
export async function recomputeProductAggregates(db: DB, productId: string) {
  await db.transaction((tx) => recomputeProduct(tx, productId));
}

/** Recompute how many times the community found a user's contributions useful. */
export async function recomputeUserHelpfulReceived(db: DB, userId: string) {
  const [rev] = await db
    .select({ n: sql<number>`coalesce(sum(${reviews.helpfulCount}), 0)::int` })
    .from(reviews)
    .where(and(eq(reviews.userId, userId), eq(reviews.status, "approved")));
  const [sol] = await db
    .select({
      n: sql<number>`coalesce(sum(${solutions.helpfulCount} + ${solutions.workedCount}), 0)::int`,
    })
    .from(solutions)
    .where(and(eq(solutions.userId, userId), eq(solutions.status, "approved")));
  await db
    .update(users)
    .set({ helpfulReceived: (rev?.n ?? 0) + (sol?.n ?? 0) })
    .where(eq(users.id, userId));
}

/** Recompute the denormalised rating aggregates on a product row. */
async function recomputeProduct(tx: Tx, productId: string) {
  const rows = await tx
    .select({
      rating: reviews.rating,
      wouldBuyAgain: reviews.wouldBuyAgain,
      categoryRatings: reviews.categoryRatings,
    })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")));

  const count = rows.length;
  if (count === 0) {
    await tx
      .update(products)
      .set({
        ratingAvg: "0",
        ratingCount: 0,
        wouldBuyAgainPct: 0,
        categoryRatingAvgs: {},
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));
    return;
  }

  const avg = rows.reduce((s, r) => s + r.rating, 0) / count;
  const yes = rows.filter((r) => r.wouldBuyAgain === "yes").length;

  const catAvgs: Record<string, number> = {};
  for (const key of CAT_KEYS) {
    const vals = rows
      .map((r) => (r.categoryRatings as Record<string, number>)?.[key])
      .filter((v): v is number => typeof v === "number" && v > 0);
    if (vals.length) {
      catAvgs[key] = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
    }
  }

  await tx
    .update(products)
    .set({
      ratingAvg: avg.toFixed(1),
      ratingCount: count,
      wouldBuyAgainPct: Math.round((100 * yes) / count),
      categoryRatingAvgs: catAvgs,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));
}

async function recomputeUserCount(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(and(eq(reviews.userId, userId), eq(reviews.status, "approved")));
  await tx
    .update(users)
    .set({ reviewCount: row?.n ?? 0, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Moderator approve/reject of a held review — flips status and refreshes aggregates. */
export async function setReviewModeration(
  db: DB,
  id: string,
  status: "approved" | "rejected",
) {
  const [row] = await db
    .update(reviews)
    .set({ status, updatedAt: new Date() })
    .where(eq(reviews.id, id))
    .returning({ productId: reviews.productId, userId: reviews.userId });
  if (!row) throw notFound("REVIEW_NOT_FOUND", "Review not found");
  await db.transaction(async (tx) => {
    await recomputeProduct(tx, row.productId);
    await recomputeUserCount(tx, row.userId);
  });
  await recomputeUserHelpfulReceived(db, row.userId);

  const [prod] = await db
    .select({ slug: products.slug, name: products.name })
    .from(products)
    .where(eq(products.id, row.productId))
    .limit(1);
  const href = prod ? `/products/${prod.slug}` : "/dashboard/reviews";

  await notify(db, {
    userIds: [row.userId],
    type: status === "approved" ? "content_approved" : "content_rejected",
    target: { type: "review", id },
    meta: { href, kind: "review" },
  });

  if (status === "approved" && prod) {
    await notify(db, {
      userIds: await followerIds(db, "product", row.productId, row.userId),
      type: "followed_new_review",
      target: { type: "product", id: row.productId },
      meta: { href, title: prod.name },
    });
  }
}

async function recomputeHelpful(tx: Tx, reviewId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(votes)
    .where(and(eq(votes.targetType, "review"), eq(votes.targetId, reviewId)));
  await tx.update(reviews).set({ helpfulCount: row?.n ?? 0 }).where(eq(reviews.id, reviewId));
}

// --- read helpers -----------------------------------------------------------

const baseSelect = {
  id: reviews.id,
  productId: reviews.productId,
  userId: reviews.userId,
  rating: reviews.rating,
  ownershipDuration: reviews.ownershipDuration,
  categoryRatings: reviews.categoryRatings,
  wouldBuyAgain: reviews.wouldBuyAgain,
  comment: reviews.comment,
  pros: reviews.pros,
  cons: reviews.cons,
  purchasePrice: reviews.purchasePrice,
  purchaseStore: reviews.purchaseStore,
  storeSlug: stores.slug,
  storeName: stores.name,
  contentLang: reviews.contentLang,
  status: reviews.status,
  helpfulCount: reviews.helpfulCount,
  createdAt: reviews.createdAt,
  updatedAt: reviews.updatedAt,
  authorId: users.id,
  authorName: users.name,
  authorAvatar: users.avatarUrl,
  authorReviews: users.reviewCount,
  authorProblems: users.problemCount,
  authorSolutions: users.solutionCount,
  authorHelpful: users.helpfulReceived,
};

type ReviewImg = { id: string; url: string };

async function loadReviewImages(
  db: DB,
  reviewIds: string[],
): Promise<Map<string, ReviewImg[]>> {
  const map = new Map<string, ReviewImg[]>();
  if (reviewIds.length === 0) return map;
  const rows = await db
    .select({ id: reviewImages.id, reviewId: reviewImages.reviewId, url: reviewImages.url })
    .from(reviewImages)
    .where(inArray(reviewImages.reviewId, reviewIds))
    .orderBy(asc(reviewImages.sort), asc(reviewImages.createdAt));
  for (const x of rows) {
    const arr = map.get(x.reviewId) ?? [];
    arr.push({ id: x.id, url: x.url });
    map.set(x.reviewId, arr);
  }
  return map;
}

function shape(
  row: Record<string, unknown>,
  votedIds: Set<string>,
  viewerId?: string,
  imagesByReview?: Map<string, ReviewImg[]>,
) {
  return {
    id: row.id as string,
    productId: row.productId as string,
    rating: row.rating as number,
    ownershipDuration: row.ownershipDuration as OwnershipDuration,
    categoryRatings: (row.categoryRatings ?? {}) as Record<string, number>,
    wouldBuyAgain: row.wouldBuyAgain as WouldBuyAgain,
    comment: (row.comment ?? null) as string | null,
    pros: (row.pros ?? []) as string[],
    cons: (row.cons ?? []) as string[],
    purchasePrice: (row.purchasePrice ?? null) as number | null,
    purchaseStore: (row.purchaseStore ?? null) as string | null,
    store:
      row.storeSlug && row.storeName
        ? { slug: row.storeSlug as string, name: row.storeName as string }
        : null,
    images: imagesByReview?.get(row.id as string) ?? [],
    contentLang: row.contentLang as "bn" | "en",
    status: row.status as ReviewStatus,
    helpfulCount: row.helpfulCount as number,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
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
    viewerHasVoted: votedIds.has(row.id as string),
    viewerCanEdit: viewerId != null && row.userId === viewerId,
  };
}

async function votedSet(db: DB, viewerId: string | undefined, reviewIds: string[]) {
  if (!viewerId || reviewIds.length === 0) return new Set<string>();
  const rows = await db
    .select({ targetId: votes.targetId })
    .from(votes)
    .where(
      and(
        eq(votes.userId, viewerId),
        eq(votes.targetType, "review"),
        inArray(votes.targetId, reviewIds),
      ),
    );
  return new Set(rows.map((r) => r.targetId));
}

export async function getReviewById(db: DB, id: string, viewerId?: string) {
  const [row] = await db
    .select(baseSelect)
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .leftJoin(stores, eq(reviews.storeId, stores.id))
    .where(eq(reviews.id, id))
    .limit(1);
  if (!row) throw notFound("REVIEW_NOT_FOUND", "Review not found");
  const voted = await votedSet(db, viewerId, [row.id as string]);
  const imgs = await loadReviewImages(db, [row.id as string]);
  return shape(row as Record<string, unknown>, voted, viewerId, imgs);
}

export async function listReviews(
  db: DB,
  productId: string,
  query: ListReviewsQuery,
  viewerId?: string,
) {
  const filters = [eq(reviews.productId, productId), eq(reviews.status, "approved")];
  if (query.ownershipDuration) {
    filters.push(eq(reviews.ownershipDuration, query.ownershipDuration));
  }
  const where = and(...filters);
  const page: PageParams = { limit: query.limit, offset: query.offset };
  const orderBy =
    query.sort === "helpful"
      ? [desc(reviews.helpfulCount), desc(reviews.createdAt)]
      : [desc(reviews.createdAt)];

  const [rows, [countRow]] = await Promise.all([
    db
      .select(baseSelect)
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
    .leftJoin(stores, eq(reviews.storeId, stores.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(page.limit)
      .offset(page.offset),
    db.select({ n: sql<number>`count(*)::int` }).from(reviews).where(where),
  ]);

  const ids = rows.map((r) => r.id as string);
  const [voted, imgs] = await Promise.all([
    votedSet(db, viewerId, ids),
    loadReviewImages(db, ids),
  ]);
  return paginated(
    rows.map((r) => shape(r as Record<string, unknown>, voted, viewerId, imgs)),
    countRow?.n ?? 0,
    page,
  );
}

export async function getMyReview(db: DB, productId: string, userId: string) {
  const [row] = await db
    .select(baseSelect)
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .leftJoin(stores, eq(reviews.storeId, stores.id))
    .where(and(eq(reviews.productId, productId), eq(reviews.userId, userId)))
    .limit(1);
  if (!row) return null;
  const voted = await votedSet(db, userId, [row.id as string]);
  const imgs = await loadReviewImages(db, [row.id as string]);
  return shape(row as Record<string, unknown>, voted, userId, imgs);
}

export async function listMyReviews(db: DB, userId: string, page: PageParams) {
  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        ...baseSelect,
        productSlug: products.slug,
        productName: products.name,
        productImage: products.primaryImage,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
    .leftJoin(stores, eq(reviews.storeId, stores.id))
      .innerJoin(products, eq(reviews.productId, products.id))
      .where(eq(reviews.userId, userId))
      .orderBy(desc(reviews.createdAt))
      .limit(page.limit)
      .offset(page.offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(eq(reviews.userId, userId)),
  ]);

  const imgs = await loadReviewImages(
    db,
    rows.map((r) => r.id as string),
  );
  const data = rows.map((r) => ({
    ...shape(r as Record<string, unknown>, new Set<string>(), userId, imgs),
    product: {
      id: r.productId as string,
      slug: r.productSlug as string,
      name: r.productName as string,
      primaryImage: (r.productImage ?? null) as string | null,
    },
  }));
  return paginated(data, countRow?.n ?? 0, page);
}

// --- mutations ------------------------------------------------------------------

export async function createReview(
  db: DB,
  productId: string,
  userId: string,
  input: CreateReviewInput,
) {
  const [prod] = await db
    .select({ id: products.id, slug: products.slug, name: products.name })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!prod) throw notFound("PRODUCT_NOT_FOUND", "Product not found");

  const [dup] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.userId, userId)))
    .limit(1);
  if (dup) {
    throw conflict(
      "REVIEW_EXISTS",
      "You have already reviewed this product. Edit your existing review instead.",
    );
  }

  const { status } = await checkContentGate(db, userId);
  const store = await resolveStore(db, input.purchaseStore);

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(reviews)
      .values({
        productId,
        userId,
        rating: input.rating,
        ownershipDuration: input.ownershipDuration,
        categoryRatings: input.categoryRatings ?? {},
        wouldBuyAgain: input.wouldBuyAgain,
        comment: input.comment ?? null,
        pros: input.pros ?? [],
        cons: input.cons ?? [],
        purchasePrice: input.purchasePrice ?? null,
        purchaseStore: store?.name ?? input.purchaseStore ?? null,
        storeId: store?.id ?? null,
        contentLang: input.contentLang ?? "en",
        status,
      })
      .returning({ id: reviews.id });

    if (typeof input.purchasePrice === "number" && input.purchasePrice > 0) {
      await tx.insert(pricePoints).values({
        productId,
        price: input.purchasePrice,
        source: "review",
        storeId: store?.id ?? null,
        reportedBy: userId,
      });
    }

    await recomputeProduct(tx, productId);
    await recomputeUserCount(tx, userId);
    return row!;
  });

  if (status === "approved") {
    await notify(db, {
      userIds: await followerIds(db, "product", productId, userId),
      actorId: userId,
      type: "followed_new_review",
      target: { type: "product", id: productId },
      meta: { href: `/products/${prod.slug}`, title: prod.name },
    });
  }
  if (typeof input.purchasePrice === "number" && input.purchasePrice > 0) {
    await maybeNotifyPriceDrop(db, productId, input.purchasePrice);
  }

  return getReviewById(db, created.id, userId);
}

export async function updateReview(
  db: DB,
  reviewId: string,
  userId: string,
  isAdmin: boolean,
  input: UpdateReviewInput,
) {
  const [existing] = await db
    .select({ id: reviews.id, userId: reviews.userId, productId: reviews.productId })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!existing) throw notFound("REVIEW_NOT_FOUND", "Review not found");
  if (existing.userId !== userId && !isAdmin) throw forbidden();

  const store =
    input.purchaseStore !== undefined ? await resolveStore(db, input.purchaseStore) : undefined;

  await db.transaction(async (tx) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.rating !== undefined) patch.rating = input.rating;
    if (input.ownershipDuration !== undefined) patch.ownershipDuration = input.ownershipDuration;
    if (input.categoryRatings !== undefined) patch.categoryRatings = input.categoryRatings;
    if (input.wouldBuyAgain !== undefined) patch.wouldBuyAgain = input.wouldBuyAgain;
    if (input.comment !== undefined) patch.comment = input.comment ?? null;
    if (input.pros !== undefined) patch.pros = input.pros;
    if (input.cons !== undefined) patch.cons = input.cons;
    if (input.purchasePrice !== undefined) patch.purchasePrice = input.purchasePrice ?? null;
    if (input.purchaseStore !== undefined) {
      patch.purchaseStore = store?.name ?? input.purchaseStore ?? null;
      patch.storeId = store?.id ?? null;
    }
    if (input.contentLang !== undefined) patch.contentLang = input.contentLang;

    await tx.update(reviews).set(patch).where(eq(reviews.id, reviewId));
    await recomputeProduct(tx, existing.productId);
  });

  return getReviewById(db, reviewId, userId);
}

export async function deleteReview(
  db: DB,
  reviewId: string,
  userId: string,
  isAdmin: boolean,
) {
  const [existing] = await db
    .select({ id: reviews.id, userId: reviews.userId, productId: reviews.productId })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!existing) throw notFound("REVIEW_NOT_FOUND", "Review not found");
  if (existing.userId !== userId && !isAdmin) throw forbidden();

  await db.transaction(async (tx) => {
    await tx.delete(reviews).where(eq(reviews.id, reviewId));
    await recomputeProduct(tx, existing.productId);
    await recomputeUserCount(tx, existing.userId);
  });
}

const MAX_REVIEW_IMAGES = 4;

export async function addReviewImage(
  db: DB,
  reviewId: string,
  userId: string,
  isPrivileged: boolean,
  url: string,
) {
  const [review] = await db
    .select({ id: reviews.id, userId: reviews.userId })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!review) throw notFound("REVIEW_NOT_FOUND", "Review not found");
  if (review.userId !== userId && !isPrivileged) throw forbidden();

  const countRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewImages)
    .where(eq(reviewImages.reviewId, reviewId));
  const n = countRows[0]?.n ?? 0;
  if (n >= MAX_REVIEW_IMAGES) {
    await deleteImageByUrl(url);
    throw badRequest("TOO_MANY_IMAGES", `Up to ${MAX_REVIEW_IMAGES} photos per review.`);
  }

  await db.insert(reviewImages).values({ reviewId, url, sort: n });
  return getReviewById(db, reviewId, userId);
}

export async function deleteReviewImage(
  db: DB,
  reviewId: string,
  imageId: string,
  userId: string,
  isPrivileged: boolean,
) {
  const [review] = await db
    .select({ userId: reviews.userId })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!review) throw notFound("REVIEW_NOT_FOUND", "Review not found");
  if (review.userId !== userId && !isPrivileged) throw forbidden();

  const [deleted] = await db
    .delete(reviewImages)
    .where(and(eq(reviewImages.id, imageId), eq(reviewImages.reviewId, reviewId)))
    .returning({ url: reviewImages.url });
  if (deleted) await deleteImageByUrl(deleted.url);
  return getReviewById(db, reviewId, userId);
}

export async function voteHelpful(db: DB, reviewId: string, userId: string, on: boolean) {
  const [review] = await db
    .select({ id: reviews.id, userId: reviews.userId, productSlug: products.slug })
    .from(reviews)
    .innerJoin(products, eq(reviews.productId, products.id))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!review) throw notFound("REVIEW_NOT_FOUND", "Review not found");

  await db.transaction(async (tx) => {
    if (on) {
      await tx
        .insert(votes)
        .values({ userId, targetType: "review", targetId: reviewId })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(votes)
        .where(
          and(
            eq(votes.userId, userId),
            eq(votes.targetType, "review"),
            eq(votes.targetId, reviewId),
          ),
        );
    }
    await recomputeHelpful(tx, reviewId);
  });

  await recomputeUserHelpfulReceived(db, review.userId);

  if (on) {
    await notifyOnce(db, {
      userIds: [review.userId],
      actorId: userId,
      type: "helpful_vote",
      target: { type: "review", id: reviewId },
      meta: { href: `/products/${review.productSlug}`, kind: "review" },
    });
  }

  return getReviewById(db, reviewId, userId);
}
