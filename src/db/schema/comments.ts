import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contentLang, moderationStatus } from "./enums";
import { users } from "./users";

export const commentTargetType = pgEnum("comment_target_type", ["review", "solution"]);

/** Flat discussion thread attached to a review or a solution. */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: commentTargetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    contentLang: contentLang("content_lang").notNull().default("en"),
    status: moderationStatus("status").notNull().default("approved"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_target_idx").on(t.targetType, t.targetId)],
);

export type Comment = typeof comments.$inferSelect;
