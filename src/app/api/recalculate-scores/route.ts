import { NextResponse } from "next/server";
import { getPrisma, reconnectPrisma, isConnectionClosedError } from "@/lib/server/prisma";
import { pluginOpportunity, queryOpportunity } from "@/lib/server/scoring";
import type { OpportunityTier } from "@prisma/client";
import type { PluginMetrics } from "@/lib/server/wordpress";

function parseOpportunityTier(value: string): OpportunityTier {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

function dbPluginToMetrics(p: {
  slug: string;
  name: string;
  pluginUrl: string;
  shortDescription: string | null;
  author: string | null;
  rating: number | null;
  ratingCount: number | null;
  activeInstalls: number | null;
  downloadedCount: number | null;
  lastUpdated: Date | null;
  testedUpTo: string | null;
  requiresWpVersion: string | null;
  requiresPhp: string | null;
}): PluginMetrics {
  return {
    slug: p.slug,
    name: p.name,
    pluginUrl: p.pluginUrl,
    shortDescription: p.shortDescription ?? "",
    author: p.author ?? "",
    rating: p.rating ?? 0,
    ratingCount: p.ratingCount ?? 0,
    activeInstalls: p.activeInstalls ?? 0,
    downloadedCount: p.downloadedCount ?? 0,
    lastUpdated: p.lastUpdated,
    testedUpTo: p.testedUpTo ?? "",
    requiresWpVersion: p.requiresWpVersion ?? "",
    requiresPhp: p.requiresPhp ?? "",
  };
}

export async function POST() {
  try {
    let prisma = await getPrisma();

    // Proactive ping — catches stale connection after idle/sleep
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      await reconnectPrisma();
      prisma = await getPrisma();
    }

    // ── Step 1: Recompute all plugin scores ──────────────────────────────
    const plugins = await prisma.plugin.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        pluginUrl: true,
        shortDescription: true,
        author: true,
        rating: true,
        ratingCount: true,
        activeInstalls: true,
        downloadedCount: true,
        lastUpdated: true,
        testedUpTo: true,
        requiresWpVersion: true,
        requiresPhp: true,
      },
    });

    let pluginsUpdated = 0;
    for (const plugin of plugins) {
      const metrics = dbPluginToMetrics(plugin);
      const result = pluginOpportunity(metrics);
      try {
        await prisma.plugin.update({
          where: { id: plugin.id },
          data: {
            demandScore: result.metrics.demand,
            competitionScore: result.metrics.competition,
            satisfactionScore: result.metrics.satisfaction,
            freshnessScore: result.metrics.freshness,
            opportunityScore: result.score,
            opportunityTier: parseOpportunityTier(result.tier),
          },
        });
        pluginsUpdated += 1;
      } catch (err) {
        if (isConnectionClosedError(err)) {
          await reconnectPrisma();
          prisma = await getPrisma();
          // retry once
          await prisma.plugin.update({
            where: { id: plugin.id },
            data: {
              demandScore: result.metrics.demand,
              competitionScore: result.metrics.competition,
              satisfactionScore: result.metrics.satisfaction,
              freshnessScore: result.metrics.freshness,
              opportunityScore: result.score,
              opportunityTier: parseOpportunityTier(result.tier),
            },
          });
          pluginsUpdated += 1;
        } else {
          throw err;
        }
      }
    }

    // ── Step 2: Recompute all query scores ───────────────────────────────
    // Fetch each query with its associated plugins' raw metrics
    const queries = await prisma.searchQuery.findMany({
      where: { status: "completed" },
      select: {
        id: true,
        plugins: {
          select: {
            plugin: {
              select: {
                slug: true,
                name: true,
                pluginUrl: true,
                shortDescription: true,
                author: true,
                rating: true,
                ratingCount: true,
                activeInstalls: true,
                downloadedCount: true,
                lastUpdated: true,
                testedUpTo: true,
                requiresWpVersion: true,
                requiresPhp: true,
              },
            },
          },
          orderBy: { position: "asc" },
        },
      },
    });

    let queriesUpdated = 0;
    for (const query of queries) {
      const pluginMetrics = query.plugins.map((qp) => dbPluginToMetrics(qp.plugin));
      const result = queryOpportunity(pluginMetrics);
      try {
        await prisma.searchQuery.update({
          where: { id: query.id },
          data: {
            opportunityScore: result.score,
            opportunityTier: parseOpportunityTier(result.tier),
            lowDemandSignal: result.lowDemandSignal,
          },
        });
        queriesUpdated += 1;
      } catch (err) {
        if (isConnectionClosedError(err)) {
          await reconnectPrisma();
          prisma = await getPrisma();
          // retry once
          await prisma.searchQuery.update({
            where: { id: query.id },
            data: {
              opportunityScore: result.score,
              opportunityTier: parseOpportunityTier(result.tier),
              lowDemandSignal: result.lowDemandSignal,
            },
          });
          queriesUpdated += 1;
        } else {
          throw err;
        }
      }
    }

    return NextResponse.json({ ok: true, pluginsUpdated, queriesUpdated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recalculate failed";
    console.error("[recalculate-scores]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
