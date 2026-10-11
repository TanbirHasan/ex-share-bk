import { and, desc, eq, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { products, productRequests, users } from "../../db/schema";
import { conflict, notFound } from "../../lib/errors";
import { adminIds, notify } from "../../lib/notify";
import { paginated, type PageParams } from "../../lib/pagination";
import { createProblem, setProblemModeration } from "../problems/problems.service";
import { createReview, setReviewModeration } from "../reviews/reviews.service";
import { createServiceExperience, setServiceModeration } from "../service/service.service";
import type { RequestContent } from "./requests.schema";

type Status = "open" | "added" | "rejected";

function contentPreview(type: string | null, payload: Record<string, unknown> | null): string | null {
  if (!type || !payload) return null;
  if (type === "review") {
    const rating = payload.rating as number | undefined;
    const comment = typeof payload.comment === "string" ? payload.comment : "";
    const snippet = comment.trim().slice(0, 100);
    return `★${rating ?? "?"}${snippet ? ` — "${snippet}${comment.length > 100 ? "…" : ""}"` : ""}`;
  }
  if (type === "problem") {
    return typeof payload.title === "string" ? payload.title : "Problem report";
  }
  if (type === "service") {
    const rating = payload.rating as number | undefined;
    return `★${rating ?? "?"} service experience`;
  }
  return null;
}

export async function createRequest(
  db: DB,
  userId: string,
  input: { rawText: string; categoryGuess?: string; content?: RequestContent },
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
    contentType: input.content?.type ?? null,
    contentPayload: input.content?.payload ?? null,
  });

  await notify(db, {
    userIds: await adminIds(db, userId),
    type: "product_request_submitted",
    actorId: userId,
    meta: { href: "/dashboard/requests", title: input.rawText },
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
        contentType: productRequests.contentType,
        contentPayload: productRequests.contentPayload,
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
    contentType: r.contentType,
    contentPreview: contentPreview(r.contentType, r.contentPayload),
  }));

  return paginated(data, count ?? 0, page);
}

export async function updateRequest(
  db: DB,
  id: string,
  status: "rejected",
): Promise<{ ok: boolean }> {
  const [row] = await db
    .update(productRequests)
    .set({ status })
    .where(eq(productRequests.id, id))
    .returning({ id: productRequests.id });
  if (!row) throw notFound("REQUEST_NOT_FOUND", "Product request not found");
  return { ok: true };
}

/**
 * Admin fulfills a request: links it to a product (new or existing), converts
 * any attached draft into a real, force-approved row credited to the
 * original requester, and notifies them. The only path "added" is reachable
 * from — see updateRequest's comment.
 */
export async function fulfillRequest(
  db: DB,
  requestId: string,
  productId: string,
  adminId: string,
): Promise<{ ok: boolean }> {
  const [request] = await db
    .select({
      id: productRequests.id,
      userId: productRequests.userId,
      status: productRequests.status,
      contentType: productRequests.contentType,
      contentPayload: productRequests.contentPayload,
    })
    .from(productRequests)
    .where(eq(productRequests.id, requestId))
    .limit(1);
  if (!request) throw notFound("REQUEST_NOT_FOUND", "Product request not found");
  if (request.status !== "open") {
    throw conflict("REQUEST_ALREADY_RESOLVED", "This request was already resolved.");
  }

  const [product] = await db
    .select({ id: products.id, slug: products.slug, name: products.name })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) throw notFound("PRODUCT_NOT_FOUND", "Product not found");

  await db
    .update(productRequests)
    .set({ status: "added", productId })
    .where(eq(productRequests.id, requestId));

  if (request.userId && request.contentType && request.contentPayload) {
    try {
      const payload = request.contentPayload as Record<string, unknown>;
      if (request.contentType === "review") {
        const created = await createReview(db, productId, request.userId, payload as never);
        await setReviewModeration(db, created.id, "approved");
      } else if (request.contentType === "problem") {
        const created = await createProblem(db, productId, request.userId, payload as never);
        await setProblemModeration(db, created.id, "approved");
      } else if (request.contentType === "service") {
        const created = await createServiceExperience(db, productId, request.userId, payload as never);
        await setServiceModeration(db, created.id, "approved");
      }
    } catch {
      // Most likely a 409 (requester already has a review/service on this
      // product — possible when fulfilling against an existing product).
      // The request still gets linked/fulfilled either way.
    }
  }

  if (request.userId) {
    await notify(db, {
      userIds: [request.userId],
      type: "product_request_fulfilled",
      actorId: adminId,
      target: { type: "product", id: productId },
      meta: { href: `/products/${product.slug}`, title: product.name },
    });
  }

  return { ok: true };
}
