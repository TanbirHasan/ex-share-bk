import { createHash, randomBytes } from "node:crypto";

/** URL-safe random token to put in a magic link. */
export const newToken = (): string => randomBytes(32).toString("base64url");

/** Deterministic hash for storage / lookup. Never store the raw token. */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
