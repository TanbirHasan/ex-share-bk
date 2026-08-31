import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { userRole } from "./enums";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  role: userRole("role").notNull().default("user"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  // Set by an admin to block the account from creating content.
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),

  // Denormalised contribution counters (kept in sync by services).
  reviewCount: integer("review_count").notNull().default(0),
  problemCount: integer("problem_count").notNull().default(0),
  solutionCount: integer("solution_count").notNull().default(0),
  helpfulReceived: integer("helpful_received").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
