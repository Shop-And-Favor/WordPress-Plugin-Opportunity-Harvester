import type { OpportunityTier, QueryType } from "@prisma/client";
import { generateDistinctQueryIdeas } from "@/lib/server/openrouter";
import { normalizeQuery } from "@/lib/server/normalize";
import { getPrisma, isConnectionClosedError, reconnectPrisma } from "@/lib/server/prisma";
import { pluginOpportunity, queryOpportunity } from "@/lib/server/scoring";
import { fetchTopPluginsForQuery } from "@/lib/server/wordpress";
import { fetchWpHotTags } from "@/lib/server/wp-trends";

const DEFAULT_SEEDS = [
  "popup sales",
  "lead capture",
  "abandoned cart",
  "email optin",
  "upsell checkout",
  "countdown timer",
  "exit intent popup",
  "woocommerce conversion",
  "coupon reveal",
  "social proof",
];

// ─── Used-theme extraction ────────────────────────────────────────────────────

async function getUsedThemeSummary(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  maxThemes: number,
): Promise<string[]> {
  const total = await prisma.searchQuery.count();

  if (total < 20) {
    return [];
  }

  const rowsToSample = total > 800 ? 400 : total;

  const rows = await prisma.searchQuery.findMany({
    select: { normalizedQuery: true },
    orderBy: { id: "desc" },
    take: rowsToSample,
  });

  const bigrams = new Set<string>();
  for (const row of rows) {
    const words = row.normalizedQuery.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      bigrams.add(`${words[0]} ${words[1]}`);
    } else if (words.length === 1) {
      bigrams.add(words[0]);
    }
  }

  // Shuffle so we don't always pick the same leading bigrams
  const arr = Array.from(bigrams);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.slice(0, maxThemes);
}

// ─── Run creation with two-pass generation ───────────────────────────────────

export async function createRunWithGeneratedQueries(input: {
  queryTarget: number;
  topN: number;
  seed?: string[];
}) {
  const prisma = await getPrisma();

  // Parallel pre-flight: WP trending tags + used-theme summary
  const [hotTags, usedThemes] = await Promise.all([
    fetchWpHotTags(30),
    getUsedThemeSummary(prisma, 80),
  ]);

  const seed = input.seed?.length ? input.seed : hotTags.length ? hotTags : DEFAULT_SEEDS;

  if (!input.seed?.length) {
    const sourceLabel = hotTags.length ? "WP hot tags" : "DEFAULT_SEEDS";
    console.log(`[processor] No user seed — using ${sourceLabel} (${seed.length} items)`);
  }

  const run = await prisma.crawlRun.create({
    data: {
      status: "running",
      queryTarget: input.queryTarget,
      topN: input.topN,
    },
  });

  async function insertIdeas(
    ideas: Array<{ query: string; type: string }>,
  ): Promise<number> {
    let count = 0;
    for (const idea of ideas) {
      const normalized = normalizeQuery(idea.query);
      if (!normalized) continue;
      try {
        await prisma.searchQuery.create({
          data: {
            runId: run.id,
            queryText: idea.query,
            normalizedQuery: normalized,
            queryType: idea.type as QueryType,
            status: "pending",
          },
        });
        count += 1;
      } catch {
        // Duplicate normalizedQuery — intentionally ignored.
      }
    }
    return count;
  }

  // Pass 1 — free generation, no avoid list
  const pass1Ideas = await generateDistinctQueryIdeas({
    count: input.queryTarget,
    seed,
    trendingTags: hotTags.length ? hotTags : undefined,
  });

  let insertedCount = await insertIdeas(pass1Ideas);
  let totalGenerated = pass1Ideas.length;

  // Pass 2 — only if novelty is low (< 20% of target inserted)
  const noveltyThreshold = Math.ceil(input.queryTarget * 0.2);
  if (insertedCount < noveltyThreshold && usedThemes.length > 0) {
    const needed = input.queryTarget - insertedCount;
    const noveltyPct = Math.round((insertedCount / input.queryTarget) * 100);
    console.log(
      `[processor] Low novelty (${noveltyPct}%). Running Pass 2 with soft-avoid list (${usedThemes.length} themes).`,
    );

    const pass2Ideas = await generateDistinctQueryIdeas({
      count: needed * 2,
      seed,
      trendingTags: hotTags.length ? hotTags : undefined,
      avoidThemes: usedThemes,
    });

    insertedCount += await insertIdeas(pass2Ideas);
    totalGenerated += pass2Ideas.length;
  }

  await prisma.crawlRun.update({
    where: { id: run.id },
    data: {
      generatedCount: totalGenerated,
      insertedCount,
      status: insertedCount > 0 ? "running" : "completed",
      completedAt: insertedCount > 0 ? null : new Date(),
    },
  });

  return {
    runId: run.id,
    generatedCount: totalGenerated,
    insertedCount,
  };
}

function parseOpportunityTier(value: string): OpportunityTier {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return "low";
}

export async function processNextPendingQueries(input: {
  runId: number;
  batchSize: number;
  topN: number;
  retryFailed?: boolean;
}) {
  let prisma = await getPrisma();

  // Always reset skipped→pending so that resuming after a Stop picks those
  // queries back up. "skipped" simply means "was pending when Stop was clicked",
  // not that there was an error.
  await prisma.searchQuery.updateMany({
    where: { runId: input.runId, status: "skipped" },
    data: { status: "pending" },
  });

  // Restore run status to "running" in case it was set to "completed" by Stop.
  await prisma.crawlRun.update({
    where: { id: input.runId },
    data: { status: "running", completedAt: null },
  }).catch(() => { /* best-effort */ });

  // If retryFailed is set, reset all failed queries for this run to pending first.
  if (input.retryFailed) {
    await prisma.searchQuery.updateMany({
      where: { runId: input.runId, status: "failed" },
      data: { status: "pending", lastError: null },
    });
  }

  const pending = await prisma.searchQuery.findMany({
    where: {
      runId: input.runId,
      status: "pending",
    },
    orderBy: { id: "asc" },
    take: Math.max(1, Math.min(50, input.batchSize)),
  });

  if (pending.length === 0) {
    await prisma.crawlRun.update({
      where: { id: input.runId },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });

    return {
      processed: 0,
      done: true,
    };
  }

  let processed = 0;

  // Proactively test the connection before starting the loop.
  // If the laptop slept and the TCP connection is stale, the ping fails
  // and we reconnect — preventing the first real query from crashing.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.warn("[processor] DB ping failed before batch — reconnecting");
    await reconnectPrisma();
    prisma = await getPrisma();
  }

  for (const query of pending) {
    try {
      await prisma.searchQuery.update({
        where: { id: query.id },
        data: {
          status: "processing",
          attempts: { increment: 1 },
        },
      });

      const plugins = await fetchTopPluginsForQuery(query.queryText, input.topN);
      const queryScore = queryOpportunity(plugins);

      for (let i = 0; i < plugins.length; i += 1) {
        const plugin = plugins[i];
        const pluginScore = pluginOpportunity(plugin);

        const saved = await prisma.plugin.upsert({
          where: { slug: plugin.slug },
          update: {
            name: plugin.name,
            pluginUrl: plugin.pluginUrl,
            shortDescription: plugin.shortDescription,
            author: plugin.author,
            rating: plugin.rating,
            ratingCount: plugin.ratingCount,
            activeInstalls: plugin.activeInstalls,
            downloadedCount: plugin.downloadedCount,
            lastUpdated: plugin.lastUpdated,
            testedUpTo: plugin.testedUpTo,
            requiresWpVersion: plugin.requiresWpVersion,
            requiresPhp: plugin.requiresPhp,
            demandScore: pluginScore.metrics.demand,
            competitionScore: pluginScore.metrics.competition,
            satisfactionScore: pluginScore.metrics.satisfaction,
            freshnessScore: pluginScore.metrics.freshness,
            opportunityScore: pluginScore.score,
            opportunityTier: parseOpportunityTier(pluginScore.tier),
          },
          create: {
            slug: plugin.slug,
            pluginUrl: plugin.pluginUrl,
            name: plugin.name,
            shortDescription: plugin.shortDescription,
            author: plugin.author,
            rating: plugin.rating,
            ratingCount: plugin.ratingCount,
            activeInstalls: plugin.activeInstalls,
            downloadedCount: plugin.downloadedCount,
            lastUpdated: plugin.lastUpdated,
            testedUpTo: plugin.testedUpTo,
            requiresWpVersion: plugin.requiresWpVersion,
            requiresPhp: plugin.requiresPhp,
            demandScore: pluginScore.metrics.demand,
            competitionScore: pluginScore.metrics.competition,
            satisfactionScore: pluginScore.metrics.satisfaction,
            freshnessScore: pluginScore.metrics.freshness,
            opportunityScore: pluginScore.score,
            opportunityTier: parseOpportunityTier(pluginScore.tier),
          },
        });

        await prisma.queryPlugin.upsert({
          where: {
            queryId_pluginId: {
              queryId: query.id,
              pluginId: saved.id,
            },
          },
          update: {
            position: i + 1,
          },
          create: {
            queryId: query.id,
            pluginId: saved.id,
            position: i + 1,
          },
        });
      }

      await prisma.searchQuery.update({
        where: { id: query.id },
        data: {
          status: "completed",
          processedAt: new Date(),
          topPluginCount: plugins.length,
          lowDemandSignal: queryScore.lowDemandSignal,
          opportunityScore: queryScore.score,
          opportunityTier: parseOpportunityTier(queryScore.tier),
          lastError: null,
        },
      });

      processed += 1;
    } catch (error) {
      if (isConnectionClosedError(error)) {
        // Connection dropped (e.g. laptop slept). Reconnect and reset this query
        // to "pending" so the next batch call automatically retries it.
        console.warn("[processor] DB connection lost — reconnecting, resetting query to pending", query.id);
        await reconnectPrisma();
        prisma = await getPrisma();
        try {
          await prisma.searchQuery.update({
            where: { id: query.id },
            data: { status: "pending" },
          });
        } catch (resetErr) {
          console.error("[processor] Failed to reset query after reconnect", resetErr);
        }
        continue;
      }
      const message = error instanceof Error ? error.message : "Unknown processing error";
      try {
        await prisma.searchQuery.update({
          where: { id: query.id },
          data: {
            status: "failed",
            lastError: message,
          },
        });
      } catch {
        // best-effort — if the DB is also dead here, the query stays in processing state
      }
    }
  }

  let remainingPending = 0;
  try {
    remainingPending = await prisma.searchQuery.count({
      where: {
        runId: input.runId,
        status: "pending",
      },
    });
  } catch {
    // If count fails, assume there are still pending queries so the caller retries
    remainingPending = 1;
  }

  try {
    await prisma.crawlRun.update({
      where: { id: input.runId },
      data: {
        processedCount: { increment: processed },
        status: remainingPending === 0 ? "completed" : "running",
        completedAt: remainingPending === 0 ? new Date() : null,
      },
    });
  } catch {
    // best-effort
  }

  return {
    processed,
    done: remainingPending === 0,
  };
}
