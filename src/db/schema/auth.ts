import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Single-use magic-link tokens for passwordless email sign-in.
 * Only the SHA-256 hash of the token is stored. Rows are deleted on use or expiry.
 */
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evt_email_idx").on(t.email)],
);

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
