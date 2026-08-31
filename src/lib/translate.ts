import { config } from "../config";

export type TranslateEngine = "libretranslate" | "identity" | "none";

/** Hard cap on how much text we send to the provider in one call. */
const MAX_CHARS = 5000;

/**
 * Machine-translate `text` from `source` to `target` using the configured
 * LibreTranslate-compatible endpoint. Returns `{ engine: "none" }` (text
 * untouched) when no endpoint is configured so the caller can decide how to
 * degrade. Throws on a provider error.
 */
export async function machineTranslate(
  text: string,
  source: "bn" | "en",
  target: "bn" | "en",
): Promise<{ text: string; engine: TranslateEngine }> {
  if (source === target) return { text, engine: "identity" };

  const endpoint = config.TRANSLATE_ENDPOINT;
  if (!endpoint) return { text, engine: "none" };

  const q = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const url = `${endpoint.replace(/\/+$/, "")}/translate`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      q,
      source,
      target,
      format: "text",
      ...(config.TRANSLATE_API_KEY ? { api_key: config.TRANSLATE_API_KEY } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`translate provider responded ${res.status}`);
  }

  const data = (await res.json().catch(() => null)) as { translatedText?: string } | null;
  if (!data?.translatedText) {
    throw new Error("translate provider returned an empty result");
  }

  return { text: data.translatedText, engine: "libretranslate" };
}
