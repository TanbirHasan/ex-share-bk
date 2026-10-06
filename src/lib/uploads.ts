import { v2 as cloudinary } from "cloudinary";
import { config } from "../config";

cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
  secure: true,
});

const CLOUDINARY_FOLDER = "experiencehub";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Sniff a small magic-byte signature so we don't trust the Content-Type alone. */
function detectImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // jpg
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // png
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return true;
  if (buf.toString("ascii", 0, 3) === "GIF") return true;
  return false;
}

/** Upload image bytes to Cloudinary. Returns the public URL, or null if invalid. */
export async function saveImage(
  buf: Buffer,
  mimeHint: string | undefined,
): Promise<{ url: string; filename: string } | null> {
  if (buf.length === 0 || buf.length > config.MAX_UPLOAD_BYTES) return null;
  const mime = mimeHint?.split(";")[0]?.trim();
  if (!detectImage(buf) && !(mime && ALLOWED_MIME.has(mime))) return null;

  const result = await new Promise<{ secure_url: string; public_id: string } | null>(
    (resolvePromise, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: CLOUDINARY_FOLDER, resource_type: "image" },
        (err, res) => {
          if (err || !res) reject(err ?? new Error("Cloudinary upload failed"));
          else resolvePromise(res);
        },
      );
      stream.end(buf);
    },
  );
  if (!result) return null;
  return { url: result.secure_url, filename: result.public_id };
}

/** Best-effort delete of a previously uploaded image. No-op for external (non-Cloudinary) URLs. */
export async function deleteImageByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const publicId = publicIdFromUrl(url);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // already gone / best-effort
  }
}

/** Reconstruct a Cloudinary public_id (including folder) from a delivery URL. */
function publicIdFromUrl(url: string): string | null {
  const marker = `/${CLOUDINARY_FOLDER}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const withExt = url.slice(i + 1); // "experiencehub/<id>.<ext>"
  return withExt.replace(/\.[a-zA-Z0-9]+(\?.*)?$/, "");
}
