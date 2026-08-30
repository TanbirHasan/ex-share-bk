import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { emailVerificationTokens, users } from "../../db/schema";
import { AppError, badRequest } from "../../lib/errors";
import { hashToken, newToken } from "../../lib/tokens";

const MAGIC_LINK_TTL_MIN = 15;
const MAGIC_LINK_MAX_PER_WINDOW = 5;

export type SyncedUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
};

/** Create the user on first sight, otherwise refresh basic profile fields. */
export async function upsertUserByEmail(
  db: DB,
  input: { email: string; name?: string; avatarUrl?: string },
): Promise<SyncedUser> {
  const email = input.email.toLowerCase().trim();

  const [existing] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: users.role,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        name: input.name ?? existing.name,
        avatarUrl: input.avatarUrl ?? existing.avatarUrl,
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        role: users.role,
      });
    return updated!;
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      name: input.name,
      avatarUrl: input.avatarUrl,
      emailVerifiedAt: new Date(),
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: users.role,
    });
  return created!;
}

/** Issue a magic-link token. Returns the raw token for the caller to email. */
export async function requestMagicLink(
  db: DB,
  rawEmail: string,
): Promise<{ token: string; expiresAt: Date }> {
  const email = rawEmail.toLowerCase().trim();
  const windowStart = new Date(Date.now() - MAGIC_LINK_TTL_MIN * 60_000);

  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.email, email),
        gte(emailVerificationTokens.createdAt, windowStart),
      ),
    );
  if ((recent?.count ?? 0) >= MAGIC_LINK_MAX_PER_WINDOW) {
    throw new AppError(429, "TOO_MANY_LINKS", "Too many sign-in links requested. Try again later.");
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60_000);
  await db.insert(emailVerificationTokens).values({
    email,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return { token, expiresAt };
}

/** Validate + consume a magic-link token, then upsert and return the user. */
export async function consumeMagicLink(
  db: DB,
  rawEmail: string,
  token: string,
): Promise<SyncedUser> {
  const email = rawEmail.toLowerCase().trim();
  const tokenHash = hashToken(token);

  const [row] = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1);

  const invalid = badRequest("INVALID_LINK", "This sign-in link is invalid or has expired.");
  if (!row || row.email !== email) throw invalid;

  // One-shot: remove it (and any siblings for this email) regardless of outcome.
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.email, email));

  if (row.expiresAt.getTime() < Date.now()) throw invalid;

  return upsertUserByEmail(db, { email });
}
