import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { products } from "./catalog";
import { contentLang, moderationStatus } from "./enums";
import { users } from "./users";

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    contentLang: contentLang("content_lang").notNull().default("en"),
    status: moderationStatus("status").notNull().default("approved"),
    answerCount: integer("answer_count").notNull().default(0),
    // Not an FK (would be circular with answers); validated in the service.
    acceptedAnswerId: uuid("accepted_answer_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("questions_product_idx").on(t.productId)],
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    contentLang: contentLang("content_lang").notNull().default("en"),
    status: moderationStatus("status").notNull().default("approved"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("answers_question_idx").on(t.questionId)],
);

export type Question = typeof questions.$inferSelect;
export type Answer = typeof answers.$inferSelect;
