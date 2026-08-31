import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { config } from "../config";

export const UPLOAD_DIR = isAbsolute(config.UPLOAD_DIR)
  ? config.UPLOAD_DIR
  : resolve(process.cwd(), config.UPLOAD_DIR);

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Sniff a small magic-byte signature so we don't trust the Content-Type alone. */
function detectImage(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "webp";
  if (buf.toString("ascii", 0, 3) === "GIF") return "gif";
  return null;
}

export function extForMime(mime: string | undefined): string | null {
  return mime ? (EXT_BY_MIME[mime.split(";")[0]!.trim()] ?? null) : null;
}

const FILENAME_RE = /^[0-9a-f]{32}\.(jpg|png|webp|gif)$/;

export function isUploadFilename(name: string): boolean {
  return FILENAME_RE.test(name);
}

export function publicUrl(filename: string): string {
  return `${config.publicBaseUrl.replace(/\/+$/, "")}/uploads/${filename}`;
}

/** Save image bytes to the upload dir. Returns the public URL, or null if invalid. */
export async function saveImage(
  buf: Buffer,
  mimeHint: string | undefined,
): Promise<{ url: string; filename: string } | null> {
  if (buf.length === 0 || buf.length > config.MAX_UPLOAD_BYTES) return null;
  const ext = detectImage(buf) ?? extForMime(mimeHint);
  if (!ext) return null;

  const filename = `${createHash("md5").update(randomUUID()).digest("hex")}.${ext}`;
  await writeFile(join(UPLOAD_DIR, filename), buf);
  return { url: publicUrl(filename), filename };
}

/** Best-effort delete of a file we previously served. No-op for external URLs. */
export async function deleteImageByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const name = url.split("/").pop() ?? "";
  if (!isUploadFilename(name)) return;
  try {
    await unlink(join(UPLOAD_DIR, name));
  } catch {
    // already gone
  }
}
