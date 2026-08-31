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
});

export type Config = z.infer<typeof schema> & { corsOrigins: string[] };

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
  };
}

export const config = load();
export const isProd = config.NODE_ENV === "production";
export const isDev = config.NODE_ENV === "development";
