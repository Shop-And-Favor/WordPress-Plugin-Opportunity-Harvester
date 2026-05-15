import { clamp } from "@/lib/server/normalize";
import type { PluginMetrics } from "@/lib/server/wordpress";

export function pluginOpportunity(input: PluginMetrics) {
  const satisfaction = clamp(Math.max((input.rating || 0) - 3, 0), 0, 1.8) / 1.8;
  const competition = clamp(Math.max(Math.log10((input.ratingCount || 0) + 1) - 1, 0), 0, 2) / 2;
  const demand = clamp(Math.min(Math.log10((input.activeInstalls || 0) + 1) - 2, 2.5), 0, 2.5) / 2.5;

  // freshness: stale competitor = good opportunity (high score), fresh competitor = bad (low score)
  const freshness = (() => {
    if (!input.lastUpdated) {
      return 0.5; // unknown — neutral
    }

    const ageDays = (Date.now() - input.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 120) {
      return 0.3; // very fresh competitor — hard to beat
    }

    if (ageDays <= 240) {
      return 0.5;
    }

    if (ageDays <= 365) {
      return 0.75;
    }

    return 1.0; // stale competitor — great opportunity
  })();

  // Weighted sum — all terms: higher = better opportunity
  // demand:           larger install base after thresholding     → positive
  // 1 - competition:  fewer ratings = lower competition          → positive
  // 1 - satisfaction: lower rating  = more user pain to solve    → positive
  // freshness:        staler plugin  = more neglected            → positive
  const score = clamp(
    0.30 * demand +
    0.25 * (1 - competition) +
    0.40 * (1 - satisfaction) +
    0.05 * freshness,
    0,
    1,
  );

  const tier = score >= 0.55 ? "high" : score >= 0.40 ? "medium" : "low";
  return {
    score: Number(score.toFixed(3)),
    tier,
    metrics: {
      demand: Number(demand.toFixed(3)),
      competition: Number(competition.toFixed(3)),
      satisfaction: Number(satisfaction.toFixed(3)),
      freshness: Number(freshness.toFixed(3)),
    },
  } as const;
}

/**
 * Pick the value at the given percentile (0–1) from an array.
 * p=0.80 → 80th percentile (top 20%).
 * Sorts ascending so higher index = higher value.
 */
function pickPercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(p * (sorted.length - 1));
  return sorted[idx];
}

export function queryOpportunity(plugins: PluginMetrics[]) {
  if (plugins.length === 0) {
    return {
      score: 0,
      lowDemandSignal: true,
      tier: "low" as const,
    };
  }

  const topFour = plugins.slice(0, 4);
  const lowDemandSignal =
    topFour.length >= 3 && topFour.every((plugin) => (plugin.activeInstalls || 0) < 10000);

  // Compute per-plugin component metrics using the same normalisation as pluginOpportunity()
  const metricsList = plugins.map((p) => pluginOpportunity(p).metrics);

  // Percentile aggregation per component — each picks a representative from the plugin set
  // p=0.80 → 80th pct = top-20% value (ascending sort, so index floor(0.80*(n-1)))
  const D = pickPercentile(metricsList.map((m) => m.demand),       0.80); // top 20% demand
  const C = pickPercentile(metricsList.map((m) => m.competition),  0.75); // top 25% competition (pessimistic)
  const S = pickPercentile(metricsList.map((m) => m.satisfaction), 0.70); // top 30% satisfaction
  const F = pickPercentile(metricsList.map((m) => m.freshness),    0.80); // top 20% freshness

  // Same weighted sum as pluginOpportunity()
  const score = clamp(
    0.30 * D +
    0.25 * (1 - C) +
    0.40 * (1 - S) +
    0.05 * F,
    0,
    1,
  );

  const tier = score >= 0.55 ? "high" : score >= 0.40 ? "medium" : "low";

  return {
    score: Number(score.toFixed(3)),
    lowDemandSignal,
    tier,
  } as const;
}

/**
 * Score a category/subcategory bucket.
 * Sorts the plugin list by activeInstalls desc, takes top 10, then applies
 * the same percentile formula as queryOpportunity().
 */
export function categoryOpportunity(plugins: PluginMetrics[]) {
  if (plugins.length === 0) {
    return { score: 0, tier: "low" as const, lowDemandSignal: true };
  }

  // Focus on market leaders — sort by activeInstalls desc, cap at 10
  const leaders = [...plugins]
    .sort((a, b) => (b.activeInstalls || 0) - (a.activeInstalls || 0))
    .slice(0, 10);

  const lowDemandSignal =
    leaders.length >= 3 && leaders.every((p) => (p.activeInstalls || 0) < 10000);

  const metricsList = leaders.map((p) => pluginOpportunity(p).metrics);

  const D = pickPercentile(metricsList.map((m) => m.demand),       0.80);
  const C = pickPercentile(metricsList.map((m) => m.competition),  0.75);
  const S = pickPercentile(metricsList.map((m) => m.satisfaction), 0.70);
  const F = pickPercentile(metricsList.map((m) => m.freshness),    0.80);

  const score = clamp(
    0.30 * D +
    0.25 * (1 - C) +
    0.40 * (1 - S) +
    0.05 * F,
    0,
    1,
  );

  const tier = score >= 0.55 ? "high" : score >= 0.40 ? "medium" : "low";

  return {
    score: Number(score.toFixed(3)),
    tier,
    lowDemandSignal,
  } as const;
}
