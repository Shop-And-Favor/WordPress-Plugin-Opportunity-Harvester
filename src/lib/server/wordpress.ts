import { getEnv } from "@/lib/server/config";
import { safeDelay, withRetry } from "@/lib/server/throttle";

type WpPlugin = {
  slug?: string;
  name?: string;
  short_description?: string | false;
  author?: string | false;
  rating?: number;
  num_ratings?: number;
  active_installs?: number;
  downloaded?: number;
  last_updated?: string | false;
  tested?: string | false;
  requires?: string | false;
  requires_php?: string | false;
};

type WpQueryResponse = {
  plugins?: WpPlugin[];
};

export type PluginMetrics = {
  slug: string;
  name: string;
  pluginUrl: string;
  shortDescription: string;
  author: string;
  rating: number;
  ratingCount: number;
  activeInstalls: number;
  downloadedCount: number;
  lastUpdated: Date | null;
  testedUpTo: string;
  requiresWpVersion: string;
  requiresPhp: string;
};

function toRatingOutOfFive(raw: number | undefined) {
  if (!raw) {
    return 0;
  }

  if (raw > 5) {
    return Number((raw / 20).toFixed(2));
  }

  return Number(raw.toFixed(2));
}

function parseWpDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toPluginMetrics(row: WpPlugin): PluginMetrics | null {
  if (!row.slug || !row.name) {
    return null;
  }

  return {
    slug: row.slug,
    name: row.name,
    pluginUrl: `https://wordpress.org/plugins/${row.slug}/`,
    shortDescription: typeof row.short_description === "string" ? row.short_description : "",
    author: typeof row.author === "string" ? row.author : "",
    rating: toRatingOutOfFive(row.rating),
    ratingCount: row.num_ratings ?? 0,
    activeInstalls: row.active_installs ?? 0,
    downloadedCount: row.downloaded ?? 0,
    lastUpdated: parseWpDate(typeof row.last_updated === "string" ? row.last_updated : undefined),
    testedUpTo: typeof row.tested === "string" ? row.tested : "",
    requiresWpVersion: typeof row.requires === "string" ? row.requires : "",
    requiresPhp: typeof row.requires_php === "string" ? row.requires_php : "",
  };
}

export async function fetchTopPluginsForQuery(query: string, topN = 10) {
  const env = getEnv();
  const endpoint = new URL("https://api.wordpress.org/plugins/info/1.2/");
  endpoint.searchParams.set("action", "query_plugins");
  endpoint.searchParams.set("request[search]", query);
  endpoint.searchParams.set("request[per_page]", String(Math.max(1, Math.min(10, topN))));
  endpoint.searchParams.set("request[page]", "1");
  endpoint.searchParams.set("request[fields][last_updated]", "1");
  endpoint.searchParams.set("request[fields][active_installs]", "1");

  const payload = await withRetry(async () => {
    const response = await fetch(endpoint.toString(), {
      headers: {
        "User-Agent": env.APP_USER_AGENT,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 429) {
      throw new Error("WordPress rate limit hit (429)");
    }

    if (!response.ok) {
      throw new Error(`WordPress query failed with ${response.status}`);
    }

    return (await response.json()) as WpQueryResponse;
  }, 2);

  await safeDelay(1400);

  return (payload.plugins ?? [])
    .map(toPluginMetrics)
    .filter((item): item is PluginMetrics => Boolean(item));
}
