import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import {
  createReportBody,
  listReportsOut,
  listReportsQuery,
  reportIdParams,
  resolveReportBody,
} from "./reports.schema";
import * as svc from "./reports.service";

/** Mounted at /api/v1. */
export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Any signed-in user can flag content.
  r.post(
    "/reports",
    {
      onRequest: app.authenticate,
      schema: {
        body: createReportBody,
        response: {
          200: z.object({ ok: z.boolean(), alreadyReported: z.boolean() }),
        },
      },
    },
    async (req) => svc.createReport(db, req.authUser!.id, req.body),
  );

  // Moderation queue.
  r.get(
    "/admin/reports",
    {
      onRequest: app.requireRole("admin", "moderator"),
      schema: { querystring: listReportsQuery, response: { 200: listReportsOut } },
    },
    async (req) =>
      svc.listReports(db, req.query.status, {
        limit: req.query.limit,
        offset: req.query.offset,
      }),
  );

  r.patch(
    "/admin/reports/:id",
    {
      onRequest: app.requireRole("admin", "moderator"),
      schema: {
        params: reportIdParams,
        body: resolveReportBody,
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (req) =>
      svc.resolveReport(
        db,
        req.authUser!.id,
        req.params.id,
        req.body.resolution,
        req.ip ?? null,
      ),
  );
}
