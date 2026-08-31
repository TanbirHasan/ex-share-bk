import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SHARED_SECRET: z.string().min(32, "AUTH_SHARED_SECRET must be at least 32 chars"),
  INTERNAL_API_SECRET: z.string().min(16, "INTERNAL_API_SECRET must be at least 16 chars"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  // Optional LibreTranslate-compatible endpoint for on-demand content translation.
  // Unset = the "Translate" feature is disabled and the API returns 503.
  TRANSLATE_ENDPOINT: z.string().url().optional(),
  TRANSLATE_API_KEY: z.string().optional(),
  // Where uploaded images are stored on disk, and the base URL they're served
  // from. In prod point PUBLIC_BASE_URL at the API's public origin.
  UPLOAD_DIR: z.string().default("uploads"),
  PUBLIC_BASE_URL: z.string().url().optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(6 * 1024 * 1024),
});

export type Config = z.infer<typeof schema> & {
  corsOrigins: string[];
  publicBaseUrl: string;
};

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(
      "✗ Invalid environment configuration:\n" +
        JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
    );
    process.exit(1);
  }
  return {
    ...parsed.data,
    corsOrigins: parsed.data.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
    publicBaseUrl:
      parsed.data.PUBLIC_BASE_URL ?? `http://localhost:${parsed.data.PORT}`,
  };
}

export const config = load();
export const isProd = config.NODE_ENV === "production";
export const isDev = config.NODE_ENV === "development";
