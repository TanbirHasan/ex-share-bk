import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import {
  contentReports,
  contentTranslations,
  problemReports,
  problems,
  solutions,
} from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { writeAudit } from "../../lib/audit";

const mergeBody = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
});

/** Mounted at /api/v1/admin/problems. Admin only. Deduplicate problems. */
export async function mergeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/merge",
    {
      onRequest: app.requireRole("admin"),
      schema: {
        body: mergeBody,
        response: {
          200: z.object({ ok: z.boolean(), targetSlug: z.string() }),
        },
      },
    },
    async (req) => {
      const { sourceId, targetId } = req.body;
      if (sourceId === targetId) {
        throw badRequest("SAME_PROBLEM", "Pick two different problems.");
      }

      const rows = await db
        .select({ id: problems.id, slug: problems.slug, title: problems.title })
        .from(problems)
        .where(sql`${problems.id} in (${sourceId}, ${targetId})`);
      const source = rows.find((x) => x.id === sourceId);
      const target = rows.find((x) => x.id === targetId);
      if (!source || !target) throw notFound("PROBLEM_NOT_FOUND", "Problem not found");

      await db.transaction(async (tx) => {
        // Reports: move the ones whose author hasn't already reported the target,
        // then drop the rest so the unique (problem_id, user_id) holds.
        const targetReporters = await tx
          .select({ userId: problemReports.userId })
          .from(problemReports)
          .where(eq(problemReports.problemId, targetId));
        const already = targetReporters.map((x) => x.userId);

        await tx
          .update(problemReports)
          .set({ problemId: targetId })
          .where(
            already.length
              ? and(
                  eq(problemReports.problemId, sourceId),
                  notInArray(problemReports.userId, already),
                )
              : eq(problemReports.problemId, sourceId),
          );
        await tx.delete(problemReports).where(eq(problemReports.problemId, sourceId));

        // Solutions move wholesale (no per-user uniqueness).
        await tx
          .update(solutions)
          .set({ problemId: targetId })
          .where(eq(solutions.problemId, sourceId));

        // Polymorphic references keyed by targetId. (Comments never attach to
        // problems, so there is nothing to move there.)
        await tx
          .update(contentReports)
          .set({ targetId })
          .where(
            and(
              eq(contentReports.targetType, "problem"),
              eq(contentReports.targetId, sourceId),
            ),
          );
        await tx
          .delete(contentTranslations)
          .where(
            and(
              eq(contentTranslations.targetType, "problem"),
              eq(contentTranslations.targetId, sourceId),
            ),
          );

        // Recompute the target's denormalised report count, then remove the source.
        const [c] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(problemReports)
          .where(eq(problemReports.problemId, targetId));
        await tx
          .update(problems)
          .set({ reportCount: c?.n ?? 0, updatedAt: new Date() })
          .where(eq(problems.id, targetId));

        await tx.delete(problems).where(and(eq(problems.id, sourceId), ne(problems.id, targetId)));
      });

      await writeAudit(db, {
        actorId: req.authUser!.id,
        action: "problem_merge",
        targetType: "problem",
        targetId,
        meta: {
          sourceId,
          sourceSlug: source.slug,
          sourceTitle: source.title,
          targetSlug: target.slug,
        },
        ip: req.ip ?? null,
      });

      return { ok: true, targetSlug: target.slug };
    },
  );
}
