import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { pricePointSource, productStatus } from "./enums";
import { users } from "./users";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameBn: text("name_bn").notNull(),
  icon: text("icon"),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  aboutEn: text("about_en"),
  aboutBn: text("about_bn"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    modelNo: text("model_no"),
    status: productStatus("status").notNull().default("active"),

    priceMin: integer("price_min"), // BDT, whole taka
    priceMax: integer("price_max"),
    warrantyText: text("warranty_text"),
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull().default({}),
    primaryImage: text("primary_image"),

    // Denormalised aggregates, recomputed on review approve/edit/delete.
    ratingAvg: numeric("rating_avg", { precision: 2, scale: 1 }).notNull().default("0"),
    ratingCount: integer("rating_count").notNull().default(0),
    wouldBuyAgainPct: integer("would_buy_again_pct").notNull().default(0),
    categoryRatingAvgs: jsonb("category_rating_avgs")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_category_idx").on(t.categoryId),
    index("products_brand_idx").on(t.brandId),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

// Retailers / sellers users bought from. Canonicalised from reviews' free-text
// "where did you buy it" so we can aggregate a profile per store.
export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  city: text("city"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Every observed price for a product — from reviews and manual "seen it for ৳X"
// reports. Drives lowest-reported price + history.
export const pricePoints = pgTable(
  "price_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    price: integer("price").notNull(), // BDT, whole taka
    source: pricePointSource("source").notNull(),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_points_product_idx").on(t.productId, t.observedAt)],
);

export type Category = typeof categories.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type PricePoint = typeof pricePoints.$inferSelect;
