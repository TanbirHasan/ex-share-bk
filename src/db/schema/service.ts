import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { products } from "./catalog";
import { contentLang, moderationStatus } from "./enums";
import { users } from "./users";

export const serviceResponseTime = pgEnum("service_response_time", [
  "same_day",
  "within_3_days",
  "within_a_week",
  "over_a_week",
  "no_response",
]);

export const serviceChannel = pgEnum("service_channel", [
  "phone",
  "email",
  "service_center",
  "home_visit",
  "social_media",
  "other",
]);

export const serviceRepairOutcome = pgEnum("service_repair_outcome", [
  "fixed",
  "partly_fixed",
  "not_fixed",
  "replaced",
  "refunded",
  "pending",
]);

export const serviceWarranty = pgEnum("service_warranty", [
  "yes",
  "no",
  "partial",
  "unsure",
]);

/** One user's after-sales / customer-care experience with a product's service. */
export const serviceExperiences = pgTable(
  "service_experiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    rating: integer("rating").notNull(), // overall 1..5
    responseTime: serviceResponseTime("response_time").notNull(),
    channel: serviceChannel("channel").notNull(),
    repairOutcome: serviceRepairOutcome("repair_outcome").notNull(),
    warranty: serviceWarranty("warranty").notNull(),

    technicianRating: integer("technician_rating"), // 1..5, null if no technician
    issue: text("issue"), // short "what needed servicing"
    cost: integer("cost"), // BDT paid, null unknown, 0 free
    durationDays: integer("duration_days"), // report -> resolution
    comment: text("comment"),

    contentLang: contentLang("content_lang").notNull().default("en"),
    status: moderationStatus("status").notNull().default("approved"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("service_experiences_product_user_uq").on(t.productId, t.userId),
    index("service_experiences_product_idx").on(t.productId),
    index("service_experiences_user_idx").on(t.userId),
  ],
);

export type ServiceExperience = typeof serviceExperiences.$inferSelect;
