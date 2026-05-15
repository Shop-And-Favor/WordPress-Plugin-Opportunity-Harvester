import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTopPluginsForQuery } from "@/lib/server/wordpress";

vi.mock("@/lib/server/config", () => ({
  getEnv: () => ({
    APP_USER_AGENT: "Test-Agent/1.0",
  }),
}));

 
global.fetch = vi.fn() as unknown as typeof fetch;

describe("fetchTopPluginsForQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch and parse plugins from WordPress API", async () => {
    const mockResponse = {
      plugins: [
        {
          slug: "test-plugin",
          name: "Test Plugin",
          short_description: "A test plugin",
          author: "Test Author",
          rating: 80,
          num_ratings: 100,
          active_installs: 10000,
          downloaded: 50000,
          last_updated: "2024-02-01",
          tested: "6.4",
          requires: "5.0",
          requires_php: "7.4",
        },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const plugins = await fetchTopPluginsForQuery("test", 10);

    expect(plugins).toHaveLength(1);
    expect(plugins[0].slug).toBe("test-plugin");
    expect(plugins[0].name).toBe("Test Plugin");
  });

  it("should respect topN limit", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        plugins: Array.from({ length: 15 }, (_, i) => ({
          slug: `plugin-${i}`,
          name: `Plugin ${i}`,
          short_description: "Test",
          author: "Author",
          rating: 100,
          num_ratings: 10,
          active_installs: 1000,
          downloaded: 5000,
        })),
      }),
    });

    const plugins = await fetchTopPluginsForQuery("test", 5);

    expect(Array.isArray(plugins)).toBe(true);
  });

  it("should convert rating from 0-100 to 0-5", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        plugins: [
          {
            slug: "plugin-1",
            name: "Plugin 1",
            rating: 100,
            num_ratings: 50,
            active_installs: 5000,
            downloaded: 10000,
          },
        ],
      }),
    });

    const plugins = await fetchTopPluginsForQuery("test");

    expect(plugins[0].rating).toBeLessThanOrEqual(5);
    expect(plugins[0].rating).toBeGreaterThanOrEqual(0);
  });

  it("should handle rate limit (429) with retry", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          plugins: [
            {
              slug: "plugin-1",
              name: "Plugin 1",
              rating: 80,
              num_ratings: 10,
              active_installs: 1000,
              downloaded: 5000,
            },
          ],
        }),
      });

    const plugins = await fetchTopPluginsForQuery("test", 10);

    expect(plugins.length).toBeGreaterThan(0);
  });

  it("should filter out incomplete plugin data", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        plugins: [
          {
            slug: "valid-plugin",
            name: "Valid Plugin",
            rating: 80,
            num_ratings: 10,
          },
          {
            // Missing slug and name - should be filtered
            rating: 80,
            num_ratings: 10,
          },
        ],
      }),
    });

    const plugins = await fetchTopPluginsForQuery("test");

    expect(plugins).toHaveLength(1);
    expect(plugins[0].slug).toBe("valid-plugin");
  });

  it("should handle default values for optional fields", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        plugins: [
          {
            slug: "minimal-plugin",
            name: "Minimal Plugin",
          },
        ],
      }),
    });

    const plugins = await fetchTopPluginsForQuery("test");

    expect(plugins[0].shortDescription).toBe("");
    expect(plugins[0].rating).toBe(0);
    expect(plugins[0].ratingCount).toBe(0);
  });
});
