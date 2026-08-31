import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "trusted", "moderator", "admin"]);

export const contentLang = pgEnum("content_lang", ["bn", "en"]);

export const moderationStatus = pgEnum("moderation_status", ["pending", "approved", "rejected"]);

export const productStatus = pgEnum("product_status", ["new", "active", "older", "discontinued"]);

// Buckets for "how long have you owned it" and "when did the problem start".
export const ownershipDuration = pgEnum("ownership_duration", [
  "lt_3m",
  "m3_6",
  "m6_12",
  "y1_2",
  "y2_3",
  "gt_3y",
]);

export const problemStartedAt = pgEnum("problem_started_at", [
  "out_of_box",
  "lt_3m",
  "m3_6",
  "m6_12",
  "y1_2",
  "y2_3",
  "gt_3y",
]);

export const wouldBuyAgain = pgEnum("would_buy_again", ["yes", "maybe", "no"]);

export const problemCategory = pgEnum("problem_category", [
  "cooling",
  "noise",
  "display",
  "power",
  "software",
  "build_quality",
  "connectivity",
  "battery",
  "performance",
  "after_sales",
  "other",
]);

export const voteTargetType = pgEnum("vote_target_type", ["review", "solution"]);

export const followTargetType = pgEnum("follow_target_type", ["product", "problem"]);

export const pricePointSource = pgEnum("price_point_source", ["review", "manual"]);

export const reportTargetType = pgEnum("report_target_type", [
  "review",
  "problem",
  "solution",
  "comment",
]);

export const translationTargetType = pgEnum("translation_target_type", [
  "review",
  "problem",
  "solution",
]);

export const reportStatus = pgEnum("report_status", [
  "open",
  "reviewing",
  "actioned",
  "dismissed",
]);

export const productRequestStatus = pgEnum("product_request_status", [
  "open",
  "added",
  "rejected",
]);
