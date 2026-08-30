import {
  boolean,
  integer,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { contentLang, moderationStatus } from "./enums";
import { problems } from "./problems";
import { users } from "./users";

export const solutions = pgTable(
  "solutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    contentLang: contentLang("content_lang").notNull().default("en"),

    // Denormalised, recomputed from solution_confirmations.
    workedCount: integer("worked_count").notNull().default(0),
    didntWorkCount: integer("didnt_work_count").notNull().default(0),
    helpfulCount: integer("helpful_count").notNull().default(0),

    status: moderationStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("solutions_problem_idx").on(t.problemId)],
);

export const solutionConfirmations = pgTable(
  "solution_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solutionId: uuid("solution_id")
      .notNull()
      .references(() => solutions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    worked: boolean("worked").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("solution_confirmations_solution_user_uq").on(t.solutionId, t.userId)],
);

export type Solution = typeof solutions.$inferSelect;
export type SolutionConfirmation = typeof solutionConfirmations.$inferSelect;
