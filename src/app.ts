import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { config, isDev } from "./config";
import { AppError } from "./lib/errors";
import authPlugin from "./plugins/auth";
import securityPlugin from "./plugins/security";
import { activityRoutes } from "./modules/activity/activity.routes";
import { brandsRoutes } from "./modules/brands/brands.routes";
import { categoriesRoutes } from "./modules/categories/categories.routes";
import { qaRoutes } from "./modules/qa/qa.routes";
import { commentsRoutes } from "./modules/comments/comments.routes";
import { compareRoutes } from "./modules/compare/compare.routes";
import { healthRoutes } from "./modules/health/health.routes";
import { internalRoutes } from "./modules/internal/internal.routes";
import { meRoutes } from "./modules/me/me.routes";
import { problemsRoutes } from "./modules/problems/problems.routes";
import { productsRoutes } from "./modules/products/products.routes";
import { recommendRoutes } from "./modules/recommend/recommend.routes";
import { reportsRoutes } from "./modules/reports/reports.routes";
import { reviewsRoutes } from "./modules/reviews/reviews.routes";
import { savedRoutes } from "./modules/saved/saved.routes";
import { searchRoutes } from "./modules/search/search.routes";
import { serviceRoutes } from "./modules/service/service.routes";
import { translateRoutes } from "./modules/translate/translate.routes";
import { usersRoutes } from "./modules/users/users.routes";
import { statsRoutes } from "./modules/stats/stats.routes";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: config.LOG_LEVEL,
      transport: isDev ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } } : undefined,
      redact: ["req.headers.authorization", 'req.headers["x-internal-secret"]'],
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { statusCode?: number; validation?: unknown; code?: string };

    if (e instanceof AppError) {
      return reply.status(e.statusCode).send({
        error: { code: e.code, message: e.message, details: e.details },
      });
    }
    // Postgres foreign-key violation -> the row is still referenced elsewhere.
    if (e.code === "23503") {
      return reply.status(409).send({
        error: { code: "IN_USE", message: "This record is still referenced by other data." },
      });
    }
    // Postgres unique violation -> fell through a service-level check.
    if (e.code === "23505") {
      return reply.status(409).send({
        error: { code: "DUPLICATE", message: "A record with those values already exists." },
      });
    }
    // Zod request validation errors from fastify-type-provider-zod
    if (e.validation || e.statusCode === 400) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: e.message },
      });
    }
    if (e.statusCode === 429) {
      return reply.status(429).send({
        error: { code: "RATE_LIMITED", message: "Too many requests, slow down." },
      });
    }
    req.log.error({ err: e }, "unhandled error");
    return reply.status(500).send({
      error: { code: "INTERNAL", message: "Something went wrong on our end." },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.url} not found` },
    });
  });

  await app.register(securityPlugin);
  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(internalRoutes, { prefix: "/internal" });
  await app.register(meRoutes, { prefix: "/api/v1/me" });
  await app.register(categoriesRoutes, { prefix: "/api/v1/categories" });
  await app.register(brandsRoutes, { prefix: "/api/v1/brands" });
  await app.register(productsRoutes, { prefix: "/api/v1/products" });
  await app.register(searchRoutes, { prefix: "/api/v1/search" });
  await app.register(compareRoutes, { prefix: "/api/v1/compare" });
  await app.register(statsRoutes, { prefix: "/api/v1/stats" });
  await app.register(activityRoutes, { prefix: "/api/v1/activity" });
  await app.register(recommendRoutes, { prefix: "/api/v1/recommend" });
  await app.register(usersRoutes, { prefix: "/api/v1/users" });
  await app.register(reviewsRoutes, { prefix: "/api/v1" });
  await app.register(problemsRoutes, { prefix: "/api/v1" });
  await app.register(serviceRoutes, { prefix: "/api/v1" });
  await app.register(savedRoutes, { prefix: "/api/v1" });
  await app.register(reportsRoutes, { prefix: "/api/v1" });
  await app.register(commentsRoutes, { prefix: "/api/v1" });
  await app.register(qaRoutes, { prefix: "/api/v1" });
  await app.register(translateRoutes, { prefix: "/api/v1/translate" });

  return app;
}
