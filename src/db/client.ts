import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config, isProd } from "../config";
import * as schema from "./schema";

// Single shared connection pool for the process.
const queryClient = postgres(config.DATABASE_URL, {
  max: isProd ? 10 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema, logger: !isProd });
export type DB = typeof db;

export async function closeDb(): Promise<void> {
  await queryClient.end({ timeout: 5 });
}
