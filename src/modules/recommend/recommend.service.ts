import { and, eq, getTableColumns, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import {
  brands,
  categories,
  problems,
  products,
  serviceExperiences,
} from "../../db/schema";
import type { Priority } from "./recommend.schema";

type WeightKey =
  | "overall"
  | "loyalty"
  | "reliability"
  | "performance"
  | "value"
  | "service"
  | "problem"
  | "price";

const WEIGHTS: Record<Priority, Partial<Record<WeightKey, number>>> = {
  balanced: { overall: 0.3, loyalty: 0.15, reliability: 0.15, service: 0.15, problem: 0.15, price: 0.1 },
  reliability: { reliability: 0.35, problem: 0.25, overall: 0.15, loyalty: 0.1, service: 0.1, price: 0.05 },
  price: { price: 0.4, value: 0.2, overall: 0.2, problem: 0.1, loyalty: 0.1 },
  performance: { performance: 0.4, overall: 0.25, loyalty: 0.15, problem: 0.1, price: 0.1 },
  after_sales: { service: 0.4, problem: 0.2, overall: 0.15, loyalty: 0.1, reliability: 0.1, price: 0.05 },
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function mapProduct(row: {
  product: typeof products.$inferSelect;
  category: { id: string; slug: string; nameEn: string; nameBn: string };
  brand: { id: string; slug: string; name: string };
}) {
  return {
    ...row.product,
    ratingAvg: Number(row.product.ratingAvg),
    category: row.category,
    brand: row.brand,
  };
}

export async function recommend(
  db: DB,
  categorySlug: string,
  budgetMax: number | null,
  priority: Priority,
) {
  const [cat] = await db
    .select({ id: categories.id, slug: categories.slug, nameEn: categories.nameEn, nameBn: categories.nameBn })
    .from(categories)
    .where(eq(categories.slug, categorySlug))
    .limit(1);

  if (!cat) {
    return { category: null, budgetMax, priority, results: [] };
  }

  const filters = [eq(products.categoryId, cat.id)];
  if (budgetMax != null) {
    filters.push(or(isNull(products.priceMin), lte(products.priceMin, budgetMax))!);
  }

  const rows = await db
    .select({
      product: getTableColumns(products),
      category: {
        id: categories.id,
        slug: categories.slug,
        nameEn: categories.nameEn,
        nameBn: categories.nameBn,
      },
      brand: { id: brands.id, slug: brands.slug, name: brands.name },
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(brands, eq(products.brandId, brands.id))
    .where(and(...filters));

  if (rows.length === 0) {
    return { category: cat, budgetMax, priority, results: [] };
  }

  const ids = rows.map((r) => r.product.id);

  const [problemRows, serviceRows] = await Promise.all([
    db
      .select({ productId: problems.productId, n: sql<number>`count(*)::int` })
      .from(problems)
      .where(and(inArray(problems.productId, ids), eq(problems.status, "approved")))
      .groupBy(problems.productId),
    db
      .select({
        productId: serviceExperiences.productId,
        avg: sql<number>`avg(${serviceExperiences.rating})::float`,
        n: sql<number>`count(*)::int`,
      })
      .from(serviceExperiences)
      .where(
        and(inArray(serviceExperiences.productId, ids), eq(serviceExperiences.status, "approved")),
      )
      .groupBy(serviceExperiences.productId),
  ]);

  const problemMap = new Map(problemRows.map((r) => [r.productId, r.n]));
  const serviceMap = new Map(serviceRows.map((r) => [r.productId, r.avg]));

  const maxPrice = Math.max(
    1,
    ...rows.map((r) => r.product.priceMin ?? r.product.priceMax ?? 0),
  );
  const weights = WEIGHTS[priority];

  const results = rows
    .map((row) => {
      const p = mapProduct(row);
      const hasReviews = p.ratingCount > 0;
      const cr = (p.categoryRatingAvgs ?? {}) as Record<string, number>;
      const problemCount = problemMap.get(p.id) ?? 0;
      const svc = serviceMap.get(p.id) ?? null;

      const overall = hasReviews ? p.ratingAvg / 5 : 0.5;
      const loyalty = hasReviews ? p.wouldBuyAgainPct / 100 : 0.5;
      const reliability = cr.reliability != null ? cr.reliability / 5 : overall;
      const performance = cr.performance != null ? cr.performance / 5 : overall;
      const value = cr.value != null ? cr.value / 5 : overall;
      const service =
        svc != null ? svc / 5 : cr.after_sales != null ? cr.after_sales / 5 : overall;
      const problem = 1 / (1 + problemCount * 0.35);
      const priceBase = p.priceMin ?? p.priceMax ?? null;
      const price =
        priceBase == null
          ? 0.5
          : budgetMax != null
            ? clamp01(1 - priceBase / Math.max(budgetMax, 1))
            : clamp01(1 - priceBase / maxPrice);

      const signals: Record<WeightKey, number> = {
        overall,
        loyalty,
        reliability,
        performance,
        value,
        service,
        problem,
        price,
      };

      let score = 0;
      for (const [k, w] of Object.entries(weights) as [WeightKey, number][]) {
        score += w * signals[k];
      }

      // Reasons — strongest, most relevant signals first.
      const reasons: string[] = [];
      if (cr.reliability != null && cr.reliability >= 4) {
        reasons.push(`Reliability rated ${cr.reliability.toFixed(1)}/5 by owners`);
      }
      if (hasReviews && problemCount === 0) reasons.push("No problems reported yet");
      if (hasReviews && p.wouldBuyAgainPct >= 75) {
        reasons.push(`${p.wouldBuyAgainPct}% of owners would buy it again`);
      }
      if (svc != null && svc >= 4) {
        reasons.push(`After-sales service rated ${svc.toFixed(1)}/5`);
      }
      if (budgetMax != null && priceBase != null && priceBase <= budgetMax * 0.82) {
        reasons.push("Comfortably within your budget");
      }
      if (hasReviews && p.ratingAvg >= 4.3 && reasons.length < 3) {
        reasons.push(`Highly rated overall (${p.ratingAvg.toFixed(1)}/5)`);
      }
      if (reasons.length === 0) {
        reasons.push(
          hasReviews
            ? `${p.ratingAvg.toFixed(1)}/5 from ${p.ratingCount} review${p.ratingCount === 1 ? "" : "s"}`
            : "Not enough community feedback yet",
        );
      }

      return {
        product: p,
        score: Math.round(score * 100),
        reasons: reasons.slice(0, 3),
        problemCount,
        serviceRating: svc != null ? Math.round(svc * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return { category: cat, budgetMax, priority, results };
}
