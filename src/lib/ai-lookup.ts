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

type TavilyResult = { title: string; url: string; content: string };

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: config.TAVILY_API_KEY,
      query: `${query} specifications price`,
      search_depth: "basic",
      max_results: 6,
    }),
  });
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const data = (await res.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}

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
    specs: { type: "OBJECT" },
  },
  required: ["found"],
};

async function geminiExtract(
  query: string,
  results: TavilyResult[],
): Promise<Omit<ProductLookupResult, "sources"> & { found: boolean }> {
  const context = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content.slice(0, 1500)}`)
    .join("\n\n");

  const prompt =
    `You are filling in a product catalogue form for "${query}" using the search results below.\n` +
    `Extract what you can confidently find. Prices are in Bangladeshi Taka (BDT) if the ` +
    `source is a Bangladeshi retailer — convert other currencies to an approximate BDT ` +
    `range only if a source gives both, otherwise omit price. "specs" should be short ` +
    `key/value technical specs (e.g. "Capacity": "253 L"), at most 10 entries. Set ` +
    `"found" to false and leave other fields out if the results don't clearly describe ` +
    `one real product.\n\n${context}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`,
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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return JSON.parse(text);
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
