import { config } from "../config";

export type ProductLookupResult = {
  name?: string;
  brand?: string;
  modelNo?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  warrantyText?: string;
  specs?: Record<string, string>;
  sources: { title: string; url: string }[];
};

type TavilyResult = { title: string; url: string; content: string; raw_content?: string | null };

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: config.TAVILY_API_KEY,
      query: `${query} full specifications price BDT Bangladesh`,
      // "advanced" + raw_content pulls the actual page text instead of a short
      // snippet — snippets alone rarely contain a full spec table or price.
      search_depth: "advanced",
      max_results: 6,
      include_raw_content: "text",
    }),
  });
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const data = (await res.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}

// Gemini's structured-output mode handles a free-form OBJECT poorly (it
// tends to just emit {}) — an array of {key, value} pairs is a schema it can
// actually follow, so specs go out this way and get folded back into a
// Record<string, string> below.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN" },
    name: { type: "STRING" },
    brand: { type: "STRING" },
    modelNo: { type: "STRING" },
    category: { type: "STRING" },
    priceMin: { type: "NUMBER" },
    priceMax: { type: "NUMBER" },
    warrantyText: { type: "STRING" },
    specs: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { key: { type: "STRING" }, value: { type: "STRING" } },
        required: ["key", "value"],
      },
    },
  },
  required: ["found"],
};

type GeminiExtraction = Omit<ProductLookupResult, "sources" | "specs"> & {
  found: boolean;
  specs?: { key: string; value: string }[];
};

async function geminiExtract(
  query: string,
  results: TavilyResult[],
): Promise<Omit<ProductLookupResult, "sources"> & { found: boolean }> {
  const context = results
    .map((r, i) => {
      const body = r.raw_content && r.raw_content.length > r.content.length ? r.raw_content : r.content;
      return `[${i + 1}] ${r.title}\n${r.url}\n${body.slice(0, 6000)}`;
    })
    .join("\n\n---\n\n");

  const prompt =
    `You are filling in a product catalogue form for "${query}" using the search results below ` +
    `(these are full page contents, not just snippets — specs tables and prices are often ` +
    `further down the page, so read the whole thing before concluding something isn't there).\n\n` +
    `Two fields are easy to confuse — keep them strictly separate:\n` +
    `- "specs": EVERY concrete technical spec as its own {key, value} pair — capacity/size, ` +
    `dimensions, weight, power/wattage, material, colour options, connectivity, display, battery, ` +
    `processor, RAM/storage, energy rating, refrigerant, voltage, and anything else that applies ` +
    `to this kind of product. Do not cap yourself to a small number; include everything concrete ` +
    `you find, each as its own entry (e.g. {"key": "Capacity", "value": "213 L"}, ` +
    `{"key": "Energy rating", "value": "5 Star"}) — never as one long paragraph.\n` +
    `- "warrantyText": ONLY the warranty/guarantee terms (how long parts/compressor/labour are ` +
    `covered), as one short plain sentence or two. Nothing else belongs here — dimensions, power, ` +
    `ratings etc. all belong under "specs" instead, even if the source lists them in the same table.\n\n` +
    `Other rules:\n` +
    `- Prices are in Bangladeshi Taka (BDT). Prefer a price stated by a Bangladeshi retailer. ` +
    `If no BDT price appears anywhere, convert a clearly-stated price in another currency to an ` +
    `approximate BDT range instead of omitting it — approximate is fine, admin will double-check it.\n` +
    `- Fill in modelNo and category whenever the sources mention them, even in passing.\n` +
    `- Only set "found" to false if the results don't clearly describe one real, identifiable product.\n\n` +
    context;

  const call = () =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": config.GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );

  // Gemini's free tier returns a transient 503 ("high demand") often enough
  // that a single attempt isn't reliable — a couple of short-backoff retries
  // clear most of them.
  let res = await call();
  for (let attempt = 0; !res.ok && res.status === 503 && attempt < 2; attempt++) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    res = await call();
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  const parsed = JSON.parse(text) as GeminiExtraction;

  const specs: Record<string, string> = {};
  for (const { key, value } of parsed.specs ?? []) {
    if (key?.trim() && value?.trim()) specs[key.trim()] = value.trim();
  }

  return { ...parsed, specs };
}

/**
 * Searches the open web for a product and asks Gemini to turn the results
 * into draft catalogue fields. Returns `null` (not an error) when either
 * provider key is unset, so the caller can degrade to "feature disabled".
 */
export async function lookupProduct(query: string): Promise<ProductLookupResult | null> {
  if (!config.TAVILY_API_KEY || !config.GEMINI_API_KEY) return null;

  const results = await tavilySearch(query);
  if (results.length === 0) {
    return { sources: [] };
  }

  const extracted = await geminiExtract(query, results);
  if (!extracted.found) {
    return { sources: results.slice(0, 3).map((r) => ({ title: r.title, url: r.url })) };
  }

  const { found: _found, ...fields } = extracted;
  return {
    ...fields,
    sources: results.slice(0, 3).map((r) => ({ title: r.title, url: r.url })),
  };
}
