import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { problems } from "../../db/schema";
import { getProductBySlug } from "../products/products.service";

const MAX = 4;

export async function compareProducts(db: DB, rawSlugs: string) {
  const slugs = [
    ...new Set(
      rawSlugs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX);

  const results = await Promise.all(
    slugs.map((slug) => getProductBySlug(db, slug).catch(() => null)),
  );
  const found = results.filter((p): p is NonNullable<typeof p> => p != null);
  if (found.length === 0) return { products: [] };

  const ids = found.map((p) => p.id);
  const counts = await db
    .select({ productId: problems.productId, n: sql<number>`count(*)::int` })
    .from(problems)
    .where(and(inArray(problems.productId, ids), eq(problems.status, "approved")))
    .groupBy(problems.productId);
  const countMap = new Map(counts.map((c) => [c.productId, c.n]));

  return {
    products: found.map((p) => ({ ...p, problemCount: countMap.get(p.id) ?? 0 })),
  };
}
