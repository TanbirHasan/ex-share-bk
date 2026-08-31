import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import {
  problems,
  products,
  reviews,
  serviceExperiences,
  solutions,
  users,
} from "../../db/schema";
import { badRequest } from "../../lib/errors";
import { writeAudit } from "../../lib/audit";
import { setReviewModeration } from "../reviews/reviews.service";
import {
  setProblemModeration,
  setSolutionModeration,
} from "../problems/problems.service";
import { setServiceModeration } from "../service/service.service";

const pendingItem = z.object({
  type: z.enum(["review", "problem", "solution", "service"]),
  id: z.string().uuid(),
  createdAt: z.date(),
  author: z.object({ id: z.string().uuid(), name: z.string().nullable() }).nullable(),
  product: z.object({ slug: z.string(), name: z.string() }),
  headline: z.string(),
  snippet: z.string(),
  href: z.string(),
});

function snippet(text: string | null, n = 160): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n).trimEnd()}…` : clean;
}

/** Mounted at /api/v1/admin/pending. Admin/moderator. First-contributions review queue. */
export async function pendingRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/",
    {
      onRequest: app.requireRole("admin", "moderator"),
      schema: { response: { 200: z.array(pendingItem) } },
    },
    async () => {
      const [rev, prob, sol, svc] = await Promise.all([
        db
          .select({
            id: reviews.id,
            createdAt: reviews.createdAt,
            comment: reviews.comment,
            rating: reviews.rating,
            aId: users.id,
            aName: users.name,
            pSlug: products.slug,
            pName: products.name,
          })
          .from(reviews)
          .innerJoin(users, eq(reviews.userId, users.id))
          .innerJoin(products, eq(reviews.productId, products.id))
          .where(eq(reviews.status, "pending"))
          .orderBy(desc(reviews.createdAt)),

        db
          .select({
            id: problems.id,
            createdAt: problems.createdAt,
            title: problems.title,
            description: problems.description,
            slug: problems.slug,
            aId: users.id,
            aName: users.name,
            pSlug: products.slug,
            pName: products.name,
          })
          .from(problems)
          .innerJoin(products, eq(problems.productId, products.id))
          .leftJoin(users, eq(problems.createdBy, users.id))
          .where(eq(problems.status, "pending"))
          .orderBy(desc(problems.createdAt)),

        db
          .select({
            id: solutions.id,
            createdAt: solutions.createdAt,
            body: solutions.body,
            problemSlug: problems.slug,
            problemTitle: problems.title,
            aId: users.id,
            aName: users.name,
            pSlug: products.slug,
            pName: products.name,
          })
          .from(solutions)
          .innerJoin(users, eq(solutions.userId, users.id))
          .innerJoin(problems, eq(solutions.problemId, problems.id))
          .innerJoin(products, eq(problems.productId, products.id))
          .where(eq(solutions.status, "pending"))
          .orderBy(desc(solutions.createdAt)),

        db
          .select({
            id: serviceExperiences.id,
            createdAt: serviceExperiences.createdAt,
            comment: serviceExperiences.comment,
            issue: serviceExperiences.issue,
            aId: users.id,
            aName: users.name,
            pSlug: products.slug,
            pName: products.name,
          })
          .from(serviceExperiences)
          .innerJoin(users, eq(serviceExperiences.userId, users.id))
          .innerJoin(products, eq(serviceExperiences.productId, products.id))
          .where(eq(serviceExperiences.status, "pending"))
          .orderBy(desc(serviceExperiences.createdAt)),
      ]);

      const items = [
        ...rev.map((x) => ({
          type: "review" as const,
          id: x.id,
          createdAt: x.createdAt,
          author: x.aId ? { id: x.aId, name: x.aName } : null,
          product: { slug: x.pSlug, name: x.pName },
          headline: x.pName,
          snippet: x.comment ? snippet(x.comment) : `Rated ${x.rating}/5`,
          href: `/products/${x.pSlug}`,
        })),
        ...prob.map((x) => ({
          type: "problem" as const,
          id: x.id,
          createdAt: x.createdAt,
          author: x.aId ? { id: x.aId, name: x.aName } : null,
          product: { slug: x.pSlug, name: x.pName },
          headline: x.title,
          snippet: snippet(x.description),
          href: `/problems/${x.slug}`,
        })),
        ...sol.map((x) => ({
          type: "solution" as const,
          id: x.id,
          createdAt: x.createdAt,
          author: x.aId ? { id: x.aId, name: x.aName } : null,
          product: { slug: x.pSlug, name: x.pName },
          headline: x.problemTitle,
          snippet: snippet(x.body),
          href: `/problems/${x.problemSlug}`,
        })),
        ...svc.map((x) => ({
          type: "service" as const,
          id: x.id,
          createdAt: x.createdAt,
          author: x.aId ? { id: x.aId, name: x.aName } : null,
          product: { slug: x.pSlug, name: x.pName },
          headline: x.pName,
          snippet: snippet(x.comment ?? x.issue),
          href: `/products/${x.pSlug}`,
        })),
      ];

      items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return items;
    },
  );

  r.post(
    "/:type/:id",
    {
      onRequest: app.requireRole("admin", "moderator"),
      schema: {
        params: z.object({
          type: z.enum(["review", "problem", "solution", "service"]),
          id: z.string().uuid(),
        }),
        body: z.object({ decision: z.enum(["approve", "reject"]) }),
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (req) => {
      const { type, id } = req.params;
      const status = req.body.decision === "approve" ? "approved" : "rejected";

      switch (type) {
        case "review":
          await setReviewModeration(db, id, status);
          break;
        case "problem":
          await setProblemModeration(db, id, status);
          break;
        case "solution":
          await setSolutionModeration(db, id, status);
          break;
        case "service":
          await setServiceModeration(db, id, status);
          break;
        default:
          throw badRequest("BAD_TYPE", "Unknown content type.");
      }

      await writeAudit(db, {
        actorId: req.authUser!.id,
        action: `pending_${req.body.decision}`,
        targetType: type,
        targetId: id,
        ip: req.ip ?? null,
      });

      return { ok: true };
    },
  );
}
