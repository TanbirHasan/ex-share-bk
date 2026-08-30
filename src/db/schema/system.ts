import {
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { contentLang, productRequestStatus, translationTargetType } from "./enums";
import { users } from "./users";

// Users asking for a product we don't have yet -> admin "missing products" queue.
export const productRequests = pgTable("product_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  rawText: text("raw_text").notNull(),
  categoryGuess: text("category_guess"),
  status: productRequestStatus("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Every search, so we can mine zero-result queries (results_count = 0).
export const searchQueries = pgTable(
  "search_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    query: text("query").notNull(),
    resultsCount: integer("results_count").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("search_queries_created_idx").on(t.createdAt)],
);

// Cache of on-demand machine translations for user content.
export const contentTranslations = pgTable(
  "content_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: translationTargetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    targetLang: contentLang("target_lang").notNull(),
    translatedText: text("translated_text").notNull(),
    engine: text("engine").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("content_translations_target_lang_uq").on(t.targetType, t.targetId, t.targetLang),
  ],
);

// Canonical bilingual labels (categories, problem categories, spec fields, pros/cons tags).
export const i18nStrings = pgTable("i18n_strings", {
  key: text("key").primaryKey(),
  en: text("en").notNull(),
  bn: text("bn").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only trail of every moderator / admin action.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_actor_idx").on(t.actorId)],
);

export type ProductRequest = typeof productRequests.$inferSelect;
export type SearchQuery = typeof searchQueries.$inferSelect;
export type ContentTranslation = typeof contentTranslations.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
