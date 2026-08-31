import { and, desc, eq, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { problems, products, reviews, solutions, users } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { reputationLevel, reputationScore } from "../../lib/reputation";

type BadgeCtx = {
  reviews: number;
  problems: number;
  solutions: number;
  helpfulReceived: number;
  confirmedSolutions: number;
  longTermOwner: boolean;
};

const BADGES: {
  key: string;
  label: string;
  description: string;
  test: (c: BadgeCtx) => boolean;
}[] = [
  { key: "reviewer", label: "Reviewer", description: "Shared 3 or more reviews", test: (c) => c.reviews >= 3 },
  {
    key: "prolific_reviewer",
    label: "Prolific reviewer",
    description: "Shared 15 or more reviews",
    test: (c) => c.reviews >= 15,
  },
  {
    key: "problem_solver",
    label: "Problem solver",
    description: "3+ solutions, at least one confirmed working",
    test: (c) => c.solutions >= 3 && c.confirmedSolutions >= 1,
  },
  {
    key: "trusted_fixer",
    label: "Trusted fixer",
    description: "5 or more confirmed-working solutions",
    test: (c) => c.confirmedSolutions >= 5,
  },
  {
    key: "helpful",
    label: "Helpful",
    description: "Contributions marked helpful 10+ times",
    test: (c) => c.helpfulReceived >= 10,
  },
  {
    key: "long_term_owner",
    label: "Long-term owner",
    description: "Reviewed a product owned 2+ years",
    test: (c) => c.longTermOwner,
  },
];

export async function getProfile(db: DB, userId: string) {
  const [u] = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: users.role,
      createdAt: users.createdAt,
      reviews: users.reviewCount,
      problems: users.problemCount,
      solutions: users.solutionCount,
      helpfulReceived: users.helpfulReceived,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) throw notFound("USER_NOT_FOUND", "User not found");

  const [conf, lt, rRev, rProb, rSol] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(solutions)
      .where(
        and(
          eq(solutions.userId, userId),
          eq(solutions.status, "approved"),
          sql`${solutions.workedCount} > 0`,
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(
        and(
          eq(reviews.userId, userId),
          eq(reviews.status, "approved"),
          sql`${reviews.ownershipDuration} in ('y2_3','gt_3y')`,
        ),
      ),
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        slug: products.slug,
        name: products.name,
      })
      .from(reviews)
      .innerJoin(products, eq(reviews.productId, products.id))
      .where(and(eq(reviews.userId, userId), eq(reviews.status, "approved")))
      .orderBy(desc(reviews.createdAt))
      .limit(6),
    db
      .select({
        id: problems.id,
        slug: problems.slug,
        title: problems.title,
        reportCount: problems.reportCount,
        createdAt: problems.createdAt,
        productName: products.name,
      })
      .from(problems)
      .innerJoin(products, eq(problems.productId, products.id))
      .where(and(eq(problems.createdBy, userId), eq(problems.status, "approved")))
      .orderBy(desc(problems.createdAt))
      .limit(6),
    db
      .select({
        id: solutions.id,
        body: solutions.body,
        workedCount: solutions.workedCount,
        helpfulCount: solutions.helpfulCount,
        createdAt: solutions.createdAt,
        slug: problems.slug,
        title: problems.title,
      })
      .from(solutions)
      .innerJoin(problems, eq(solutions.problemId, problems.id))
      .where(and(eq(solutions.userId, userId), eq(solutions.status, "approved")))
      .orderBy(desc(solutions.createdAt))
      .limit(6),
  ]);

  const counts = {
    reviews: u.reviews,
    problems: u.problems,
    solutions: u.solutions,
    helpfulReceived: u.helpfulReceived,
  };
  const ctx: BadgeCtx = {
    ...counts,
    confirmedSolutions: conf[0]?.n ?? 0,
    longTermOwner: (lt[0]?.n ?? 0) > 0,
  };
  const score = reputationScore(counts);
  const level = reputationLevel(score);

  return {
    id: u.id,
    name: u.name,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
    staff: u.role === "admin" || u.role === "moderator",
    counts,
    score,
    level: { key: level.key, label: level.label },
    badges: BADGES.filter((b) => b.test(ctx)).map(({ key, label, description }) => ({
      key,
      label,
      description,
    })),
    recent: {
      reviews: rRev.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        product: { slug: r.slug, name: r.name },
      })),
      problems: rProb.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        reportCount: p.reportCount,
        createdAt: p.createdAt,
        productName: p.productName,
      })),
      solutions: rSol.map((s) => ({
        id: s.id,
        body: s.body.length > 240 ? `${s.body.slice(0, 240)}…` : s.body,
        workedCount: s.workedCount,
        helpfulCount: s.helpfulCount,
        createdAt: s.createdAt,
        problem: { slug: s.slug, title: s.title },
      })),
    },
  };
}
