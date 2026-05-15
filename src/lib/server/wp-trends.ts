type HotTagsResponse = Record<string, { name?: string; count?: number }>;

export async function fetchWpHotTags(limit: number): Promise<string[]> {
  try {
    const url = new URL("https://api.wordpress.org/plugins/info/1.2/");
    url.searchParams.set("action", "hot_tags");
    url.searchParams.set("request[number]", String(Math.max(1, Math.min(200, limit))));

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as HotTagsResponse;

    return Object.values(data)
      .map((entry) => (typeof entry.name === "string" ? entry.name.trim() : ""))
      .filter((name) => name.length > 0)
      .slice(0, limit);
  } catch {
    return [];
  }
}
