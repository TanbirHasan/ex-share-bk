import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../../db/client";
import { paginationQuery } from "../../lib/pagination";
import {
  addReportBody,
  confirmBody,
  createProblemBody,
  createSolutionBody,
  listProblemsOut,
  listProblemsQuery,
  myProblemsOut,
  mySolutionsOut,
  problemDetailOut,
  problemIdParams,
  problemSlugParams,
  productProblemsParams,
  solutionIdParams,
  updateSolutionBody,
} from "./problems.schema";
import * as svc from "./problems.service";

const privileged = (role: string) => role === "admin" || role === "moderator";

/** Mounted at /api/v1. */
export async function problemsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/problems",
    { schema: { querystring: listProblemsQuery, response: { 200: listProblemsOut } } },
    async (req) => svc.listProblems(db, req.query),
  );

  r.get(
    "/products/:productId/problems",
    {
      schema: {
        params: productProblemsParams,
        querystring: z.object(paginationQuery),
        response: { 200: listProblemsOut },
      },
    },
    async (req) =>
      svc.listProductProblems(db, req.params.productId, {
        limit: req.query.limit,
        offset: req.query.offset,
      }),
  );

  r.get(
    "/problems/:slug",
    {
      onRequest: app.optionalAuthenticate,
      schema: { params: problemSlugParams, response: { 200: problemDetailOut } },
    },
    async (req) => svc.getProblemBySlug(db, req.params.slug, req.authUser?.id),
  );

  r.post(
    "/products/:productId/problems",
    {
      onRequest: app.authenticate,
      schema: {
        params: productProblemsParams,
        body: createProblemBody,
        response: { 201: problemDetailOut },
      },
    },
    async (req, reply) => {
      const p = await svc.createProblem(db, req.params.productId, req.authUser!.id, req.body);
      return reply.status(201).send(p);
    },
  );

  r.post(
    "/problems/:id/reports",
    {
      onRequest: app.authenticate,
      schema: { params: problemIdParams, body: addReportBody, response: { 200: problemDetailOut } },
    },
    async (req) => svc.addReport(db, req.params.id, req.authUser!.id, req.body),
  );

  r.post(
    "/problems/:id/solutions",
    {
      onRequest: app.authenticate,
      schema: {
        params: problemIdParams,
        body: createSolutionBody,
        response: { 201: problemDetailOut },
      },
    },
    async (req, reply) => {
      const p = await svc.createSolution(db, req.params.id, req.authUser!.id, req.body);
      return reply.status(201).send(p);
    },
  );

  r.patch(
    "/solutions/:id",
    {
      onRequest: app.authenticate,
      schema: {
        params: solutionIdParams,
        body: updateSolutionBody.required({ body: true }),
        response: { 200: problemDetailOut },
      },
    },
    async (req) =>
      svc.updateSolution(
        db,
        req.params.id,
        req.authUser!.id,
        privileged(req.authUser!.role),
        req.body.body,
      ),
  );

  r.delete(
    "/solutions/:id",
    { onRequest: app.authenticate, schema: { params: solutionIdParams } },
    async (req, reply) => {
      await svc.deleteSolution(
        db,
        req.params.id,
        req.authUser!.id,
        privileged(req.authUser!.role),
      );
      return reply.status(204).send();
    },
  );

  r.post(
    "/solutions/:id/confirm",
    {
      onRequest: app.authenticate,
      schema: { params: solutionIdParams, body: confirmBody, response: { 200: problemDetailOut } },
    },
    async (req) =>
      svc.confirmSolution(db, req.params.id, req.authUser!.id, req.body.worked),
  );

  r.delete(
    "/solutions/:id/confirm",
    {
      onRequest: app.authenticate,
      schema: { params: solutionIdParams, response: { 200: problemDetailOut } },
    },
    async (req) => svc.confirmSolution(db, req.params.id, req.authUser!.id, null),
  );

  r.post(
    "/solutions/:id/vote",
    {
      onRequest: app.authenticate,
      schema: { params: solutionIdParams, response: { 200: problemDetailOut } },
    },
    async (req) => svc.voteSolution(db, req.params.id, req.authUser!.id, true),
  );

  r.delete(
    "/solutions/:id/vote",
    {
      onRequest: app.authenticate,
      schema: { params: solutionIdParams, response: { 200: problemDetailOut } },
    },
    async (req) => svc.voteSolution(db, req.params.id, req.authUser!.id, false),
  );

  r.get(
    "/me/problems",
    {
      onRequest: app.authenticate,
      schema: { querystring: z.object(paginationQuery), response: { 200: myProblemsOut } },
    },
    async (req) =>
      svc.listMyProblems(db, req.authUser!.id, {
        limit: req.query.limit,
        offset: req.query.offset,
      }),
  );

  r.get(
    "/me/solutions",
    {
      onRequest: app.authenticate,
      schema: { querystring: z.object(paginationQuery), response: { 200: mySolutionsOut } },
    },
    async (req) =>
      svc.listMySolutions(db, req.authUser!.id, {
        limit: req.query.limit,
        offset: req.query.offset,
      }),
  );
}
