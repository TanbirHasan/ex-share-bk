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
import { products, stores } from "./catalog";
import { contentLang, moderationStatus, ownershipDuration, wouldBuyAgain } from "./enums";
import { users } from "./users";

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    rating: integer("rating").notNull(), // 1..5, enforced in the service layer
    ownershipDuration: ownershipDuration("ownership_duration").notNull(),
    // { reliability, performance, value, after_sales } -> 1..5
    categoryRatings: jsonb("category_ratings")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    wouldBuyAgain: wouldBuyAgain("would_buy_again").notNull(),

    comment: text("comment"),
    pros: text("pros").array().notNull().default([]),
    cons: text("cons").array().notNull().default([]),

    purchasePrice: integer("purchase_price"), // BDT
    purchaseStore: text("purchase_store"), // free-text display name (kept for legacy + "other")
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),

    contentLang: contentLang("content_lang").notNull().default("en"),
    status: moderationStatus("status").notNull().default("pending"),
    helpfulCount: integer("helpful_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("reviews_product_user_uq").on(t.productId, t.userId),
    index("reviews_product_idx").on(t.productId),
    index("reviews_user_idx").on(t.userId),
    index("reviews_status_idx").on(t.status),
  ],
);

export const reviewImages = pgTable(
  "review_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_images_review_idx").on(t.reviewId)],
);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type ReviewImage = typeof reviewImages.$inferSelect;
