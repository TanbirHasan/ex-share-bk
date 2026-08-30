import {
  integer,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { products } from "./catalog";
import { contentLang, moderationStatus, problemCategory, problemStartedAt } from "./enums";
import { users } from "./users";

export const problems = pgTable(
  "problems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    category: problemCategory("category").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    contentLang: contentLang("content_lang").notNull().default("en"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),

    // Denormalised: number of problem_reports, recomputed on report insert/delete.
    reportCount: integer("report_count").notNull().default(1),
    status: moderationStatus("status").notNull().default("approved"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("problems_product_idx").on(t.productId),
    index("problems_category_idx").on(t.category),
  ],
);

export const problemReports = pgTable(
  "problem_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    whenStarted: problemStartedAt("when_started"),
    repairCost: integer("repair_cost"), // BDT
    warrantyCovered: text("warranty_covered"), // "yes" | "no" | "partial" | null
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("problem_reports_problem_user_uq").on(t.problemId, t.userId),
    index("problem_reports_problem_idx").on(t.problemId),
  ],
);

export type Problem = typeof problems.$inferSelect;
export type ProblemReport = typeof problemReports.$inferSelect;
