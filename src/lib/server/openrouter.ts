import { getEnv } from "@/lib/server/config";
import { normalizeQuery } from "@/lib/server/normalize";

type QueryIdea = {
  query: string;
  type: "short" | "long";
};

type OpenRouterChoice = {
  message?: {
    content?: string;
  };
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
};

const MODELS = {
  primary: "google/gemini-2.5-flash-lite",
  fallback: "openai/gpt-4o-mini",
};

const WP_CATEGORIES =
  "ecommerce, SEO, forms, email marketing, security, performance, booking, membership, social proof, analytics, backup, GDPR, page builder, multilingual, accessibility";

function buildPrompt(
  seed: string[],
  count: number,
  trendingTags?: string[],
  avoidThemes?: string[],
) {
  const lines = [
    "Generate distinct WordPress plugin search queries for market opportunity research.",
    "Output JSON only with this exact shape:",
    '{"queries":[{"query":"...","type":"short|long"}]}',
    `Target total queries: ${count}.`,
    "Rules:",
    "- 55% short (1-3 words), 45% long (4-8 words)",
    "- No duplicates or near-duplicates",
    "- Focus on plugin buyer intent, pain points, and use-case phrasing",
    "- Include commercial and operational intents",
    "- Do not include brand names unless unavoidable",
    `- Spread queries across multiple WordPress plugin categories, including: ${WP_CATEGORIES}`,
    "Seed themes:",
    seed.join(", "),
  ];

  if (trendingTags && trendingTags.length > 0) {
    lines.push(
      "WordPress trending tags (use as thematic inspiration, not literal query text):",
      trendingTags.join(", "),
    );
  }

  if (avoidThemes && avoidThemes.length > 0) {
    lines.push(
      "These themes are already well-covered — deprioritise them, but do not exclude if needed to reach the count:",
      avoidThemes.join(", "),
    );
  }

  return lines.join("\n");
}

function parseIdeas(raw: string): QueryIdea[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      queries?: Array<{ query?: string; type?: string }>;
    };

    const rows = parsed.queries ?? [];
    return rows
      .map<QueryIdea>((row) => {
        const query = (row.query ?? "").trim();
        const type: QueryIdea["type"] = row.type === "long" ? "long" : "short";
        return { query, type };
      })
      .filter((row) => row.query.length > 0);
  } catch {
    return [];
  }
}

async function callModel(model: string, prompt: string) {
  const env = getEnv();

  if (!env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY.includes("your-openrouter-api-key-here")) {
    throw new Error("OpenRouter API key is not configured. Add OPENROUTER_API_KEY to AWS Secrets Manager.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You are a strict JSON generator.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`OpenRouter ${model} failed with status ${response.status}${details ? `: ${details}` : ""}`);
  }

  const payload = (await response.json()) as OpenRouterResponse;
  return payload.choices?.[0]?.message?.content ?? "";
}

// ─── Plugin taxonomy generation ─────────────────────────────────────────────

export type TaxonomyEntry = {
  category: string;
  subcategory: string;
  description: string;
};

export type ClassifyResult = {
  slug: string;
  category: string;
  subcategory: string;
};

function parseTaxonomy(raw: string): TaxonomyEntry[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      categories?: Array<{ category?: string; subcategory?: string; description?: string }>;
    };
    return (parsed.categories ?? [])
      .map((r) => ({
        category: (r.category ?? "").trim(),
        subcategory: (r.subcategory ?? "").trim(),
        description: (r.description ?? "").trim(),
      }))
      .filter((r) => r.category.length > 0 && r.subcategory.length > 0);
  } catch {
    return [];
  }
}

function parseClassifications(raw: string): ClassifyResult[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Array<{
      slug?: string;
      category?: string;
      subcategory?: string;
    }>;
    return parsed
      .map((r) => ({
        slug: (r.slug ?? "").trim(),
        category: (r.category ?? "").trim(),
        subcategory: (r.subcategory ?? "").trim(),
      }))
      .filter((r) => r.slug.length > 0 && r.category.length > 0 && r.subcategory.length > 0);
  } catch {
    return [];
  }
}

/**
 * Given up to 300 representative plugins, ask the LLM to produce a focused
 * WordPress plugin taxonomy (category → subcategory pairs).
 */
export async function generatePluginTaxonomy(
  plugins: Array<{ name: string; description: string }>,
): Promise<TaxonomyEntry[]> {
  const lines = plugins.map((p, i) => `${i + 1}. ${p.name}: ${p.description}`).join("\n");
  const prompt = [
    "You are a WordPress plugin market analyst.",
    "Given the following list of popular WordPress plugin names and descriptions, create a focused taxonomy.",
    "Output JSON only with this exact shape:",
    '{"categories":[{"category":"...","subcategory":"...","description":"one-sentence description"}]}',
    "Rules:",
    "- 6–10 top-level categories (e.g. Ecommerce, SEO, Forms, Security, Performance, Booking, Membership, Analytics, Backup, Page Builder)",
    "- 2–5 subcategories per category",
    "- Total 20–40 category+subcategory pairs",
    "- Each pair must be distinct and non-overlapping",
    "- Subcategory names should be more specific than the category name",
    "Plugin list:",
    lines,
  ].join("\n");

  let raw = "";
  try {
    raw = await callModel(MODELS.primary, prompt);
  } catch {
    raw = await callModel(MODELS.fallback, prompt);
  }

  return parseTaxonomy(raw);
}

/**
 * Classify a batch of up to 25 plugins into the provided taxonomy.
 * Every plugin must be assigned — use the closest match if no perfect fit.
 */
export async function classifyPluginBatch(
  plugins: Array<{ slug: string; name: string; description: string }>,
  taxonomy: Array<{ category: string; subcategory: string }>,
): Promise<ClassifyResult[]> {
  const pluginLines = plugins
    .map((p, i) => `${i + 1}. slug: "${p.slug}" | name: "${p.name}" | description: "${p.description}"`)
    .join("\n");
  const taxonomyLines = taxonomy
    .map((t) => `- ${t.category} > ${t.subcategory}`)
    .join("\n");

  const prompt = [
    "You are a WordPress plugin classifier.",
    "Classify each plugin below into exactly one category+subcategory pair from the provided taxonomy.",
    "Output JSON only — an array with this exact shape:",
    '[{"slug":"...","category":"...","subcategory":"..."}]',
    "Rules:",
    "- Every plugin must be assigned — use the closest match if none is perfect",
    "- Use exact category and subcategory strings from the taxonomy (case-sensitive)",
    "- Do not invent new categories",
    "Taxonomy:",
    taxonomyLines,
    "Plugins to classify:",
    pluginLines,
  ].join("\n");

  let raw = "";
  try {
    raw = await callModel(MODELS.primary, prompt);
  } catch {
    raw = await callModel(MODELS.fallback, prompt);
  }

  return parseClassifications(raw);
}

// ─── Query idea generation ────────────────────────────────────────────────────

export async function generateDistinctQueryIdeas(input: {
  count: number;
  seed: string[];
  trendingTags?: string[];
  avoidThemes?: string[];
}) {
  const target = Math.max(10, Math.min(250, input.count));
  const prompt = buildPrompt(input.seed, target, input.trendingTags, input.avoidThemes);

  let raw = "";
  try {
    raw = await callModel(MODELS.primary, prompt);
  } catch {
    raw = await callModel(MODELS.fallback, prompt);
  }

  const ideas = parseIdeas(raw);
  const uniqueByNormalized = new Map<string, QueryIdea>();

  for (const idea of ideas) {
    const normalized = normalizeQuery(idea.query);
    if (!normalized || uniqueByNormalized.has(normalized)) {
      continue;
    }

    uniqueByNormalized.set(normalized, idea);
  }

  return Array.from(uniqueByNormalized.values()).slice(0, target);
}
