import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import underPressure from "@fastify/under-pressure";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { config } from "../config";

/**
 * Baseline hardening applied to every route:
 *  - helmet security headers (CSP disabled: this is a JSON API, not an HTML app)
 *  - CORS locked to the configured frontend origin(s)
 *  - a coarse global rate limit (per-route limits are tightened later)
 *  - load shedding via under-pressure
 */
async function securityPlugin(app: FastifyInstance): Promise<void> {
  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });

  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    hook: "onRequest",
  });

  await app.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 512 * 1024 * 1024,
    retryAfter: 15,
  });
}

export default fp(securityPlugin, { name: "security" });
