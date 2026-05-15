import { describe, it, expect } from "vitest";
import { pluginOpportunity, queryOpportunity } from "@/lib/server/scoring";
import type { PluginMetrics } from "@/lib/server/wordpress";

const mockPlugin = (overrides: Partial<PluginMetrics> = {}): PluginMetrics => ({
  slug: "test-plugin",
  name: "Test Plugin",
  pluginUrl: "https://wordpress.org/plugins/test-plugin/",
  shortDescription: "A test plugin",
  author: "Test Author",
  rating: 4.5,
  ratingCount: 100,
  activeInstalls: 10000,
  downloadedCount: 50000,
  lastUpdated: new Date("2024-02-01"),
  testedUpTo: "6.4",
  requiresWpVersion: "5.0",
  requiresPhp: "7.4",
  ...overrides,
});

describe("pluginOpportunity", () => {
  it("should score highly saturated plugin low", () => {
    const plugin = mockPlugin({
      activeInstalls: 1000000,
      ratingCount: 10000,
      rating: 4.8,
    });

    const result = pluginOpportunity(plugin);
    expect(result.score).toBeLessThan(0.2);
    expect(result.tier).toBe("low");
  });

  it("should score niche opportunity high", () => {
    const plugin = mockPlugin({
      activeInstalls: 15000,
      ratingCount: 42,
      rating: 4.3,
      lastUpdated: new Date(),
    });

    const result = pluginOpportunity(plugin);
    expect(result.score).toBeGreaterThan(0.35);
    expect(result.tier).toBe("high");
  });

  it("should penalize old plugins", () => {
    const recentPlugin = mockPlugin({
      lastUpdated: new Date(),
    });

    const oldPlugin = mockPlugin({
      lastUpdated: new Date("2022-01-01"),
    });

    const recentScore = pluginOpportunity(recentPlugin).score;
    const oldScore = pluginOpportunity(oldPlugin).score;

    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it("should handle missing last_updated", () => {
    const plugin = mockPlugin({
      lastUpdated: null,
    });

    expect(() => pluginOpportunity(plugin)).not.toThrow();
    const result = pluginOpportunity(plugin);
    expect(result.score).toBeGreaterThan(0);
  });

  it("should tier correctly", () => {
    const plugin1 = mockPlugin({
      activeInstalls: 500000,
      ratingCount: 30,
      rating: 2.5,
    });
    const result1 = pluginOpportunity(plugin1);
    expect(["high", "medium", "low"]).toContain(result1.tier);

    const plugin2 = mockPlugin({
      activeInstalls: 50000,
      ratingCount: 300,
      rating: 3.5,
    });
    const result2 = pluginOpportunity(plugin2);
    expect(["high", "medium", "low"]).toContain(result2.tier);

    const plugin3 = mockPlugin({
      activeInstalls: 5000,
      ratingCount: 5000,
      rating: 4.9,
    });
    const result3 = pluginOpportunity(plugin3);
    expect(["high", "medium", "low"]).toContain(result3.tier);

    expect(result1.score).toBeGreaterThan(result3.score);
  });
});

describe("queryOpportunity", () => {
  it("should return low score for empty results", () => {
    const result = queryOpportunity([]);
    expect(result.score).toBe(0);
    expect(result.lowDemandSignal).toBe(true);
    expect(result.tier).toBe("low");
  });

  it("should detect low demand signal when top plugins are low", () => {
    const plugins = [
      mockPlugin({ activeInstalls: 5000 }),
      mockPlugin({ activeInstalls: 8000 }),
      mockPlugin({ activeInstalls: 7000 }),
    ];

    const result = queryOpportunity(plugins);
    expect(result.lowDemandSignal).toBe(true);
  });

  it("should not trigger low demand signal with high installs", () => {
    const plugins = [
      mockPlugin({ activeInstalls: 50000 }),
      mockPlugin({ activeInstalls: 80000 }),
      mockPlugin({ activeInstalls: 70000 }),
    ];

    const result = queryOpportunity(plugins);
    expect(result.lowDemandSignal).toBe(false);
  });

  it("should penalize if low demand signal is detected", () => {
    const highDemandPlugins = [
      mockPlugin({ activeInstalls: 50000 }),
      mockPlugin({ activeInstalls: 60000 }),
      mockPlugin({ activeInstalls: 55000 }),
    ];

    const lowDemandPlugins = [
      mockPlugin({ activeInstalls: 5000 }),
      mockPlugin({ activeInstalls: 6000 }),
      mockPlugin({ activeInstalls: 5500 }),
    ];

    const highScore = queryOpportunity(highDemandPlugins).score;
    const lowScore = queryOpportunity(lowDemandPlugins).score;

    expect(lowScore).toBeLessThan(highScore);
  });

  it("should rank opportunities correctly", () => {
    const highOpportunity = [
      mockPlugin({ activeInstalls: 20000, ratingCount: 50, rating: 4.0 }),
      mockPlugin({ activeInstalls: 25000, ratingCount: 40, rating: 3.9 }),
    ];

    const saturated = [
      mockPlugin({ activeInstalls: 500000, ratingCount: 5000, rating: 4.8 }),
      mockPlugin({ activeInstalls: 600000, ratingCount: 4500, rating: 4.7 }),
    ];

    const highTier = queryOpportunity(highOpportunity);
    const saturatedTier = queryOpportunity(saturated);

    expect(highTier.score).toBeGreaterThan(saturatedTier.score);
  });
});
