import type { OpportunityTier } from "@prisma/client";
import {
  classifyPluginBatch,
  generatePluginTaxonomy,
  type TaxonomyEntry,
} from "@/lib/server/openrouter";
import { getPrisma } from "@/lib/server/prisma";
import { categoryOpportunity } from "@/lib/server/scoring";
import type { PluginMetrics } from "@/lib/server/wordpress";

const BATCH_SIZE = 25;
const TAXONOMY_SAMPLE = 300;

function parseOpportunityTier(value: string): OpportunityTier {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

// ─── Phase 1: Build taxonomy ──────────────────────────────────────────────────

async function buildTaxonomy(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
): Promise<{ taxonomy: TaxonomyEntry[]; inserted: number }> {
  // Sample top plugins by active installs for taxonomy generation
  const topPlugins = await prisma.plugin.findMany({
    select: { name: true, shortDescription: true },
    orderBy: { activeInstalls: "desc" },
    take: TAXONOMY_SAMPLE,
  });

  const input = topPlugins.map((p) => ({
    name: p.name,
    description: p.shortDescription ?? "",
  }));

  const taxonomy = await generatePluginTaxonomy(input);

  if (taxonomy.length === 0) {
    throw new Error("LLM returned an empty taxonomy — cannot proceed.");
  }

  // Full rebuild: clear existing classification data first
  await prisma.pluginCategoryMap.deleteMany({});
  await prisma.pluginCategory.deleteMany({});

  // Insert new taxonomy
  for (const entry of taxonomy) {
    await prisma.pluginCategory.create({
      data: {
        category: entry.category,
        subcategory: entry.subcategory,
        description: entry.description || null,
      },
    });
  }

  return { taxonomy, inserted: taxonomy.length };
}

// ─── Phase 2: Classify plugins ────────────────────────────────────────────────

async function classifyAllPlugins(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  taxonomy: TaxonomyEntry[],
): Promise<number> {
  const allPlugins = await prisma.plugin.findMany({
    select: { id: true, slug: true, name: true, shortDescription: true },
    orderBy: { id: "asc" },
  });

  // Build a lookup for categoryId resolution
  const categoryRows = await prisma.pluginCategory.findMany({
    select: { id: true, category: true, subcategory: true },
  });
  const categoryKey = (cat: string, sub: string) => `${cat}|||${sub}`;
  const categoryMap = new Map<string, number>(
    categoryRows.map((r) => [categoryKey(r.category, r.subcategory), r.id]),
  );

  const taxonomyRef = taxonomy.map((t) => ({
    category: t.category,
    subcategory: t.subcategory,
  }));

  let classified = 0;

  // Process in batches of BATCH_SIZE
  for (let offset = 0; offset < allPlugins.length; offset += BATCH_SIZE) {
    const batch = allPlugins.slice(offset, offset + BATCH_SIZE);

    const input = batch.map((p) => ({
      slug: p.slug,
      name: p.name,
      description: p.shortDescription ?? "",
    }));

    let results;
    try {
      results = await classifyPluginBatch(input, taxonomyRef);
    } catch (err) {
      // Log and skip this batch — don't abort the whole run
      console.warn(
        `[categorize] classify batch ${offset}–${offset + batch.length} failed:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    for (const result of results) {
      const plugin = batch.find((p) => p.slug === result.slug);
      if (!plugin) continue;

      const catId = categoryMap.get(categoryKey(result.category, result.subcategory));
      if (!catId) {
        // LLM invented a category — skip
        console.warn(`[categorize] Unknown category "${result.category} > ${result.subcategory}" for slug "${result.slug}" — skipped`);
        continue;
      }

      try {
        await prisma.pluginCategoryMap.create({
          data: { pluginId: plugin.id, categoryId: catId },
        });
        classified += 1;
      } catch {
        // Duplicate — already mapped (shouldn't happen on full rebuild but safe)
      }
    }
  }

  return classified;
}

// ─── Phase 3: Score each category ────────────────────────────────────────────

async function scoreCategories(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
): Promise<number> {
  const categories = await prisma.pluginCategory.findMany({
    include: {
      plugins: {
        include: {
          plugin: {
            select: {
              activeInstalls: true,
              downloadedCount: true,
              rating: true,
              ratingCount: true,
              lastUpdated: true,
              // fields needed to reconstruct PluginMetrics for categoryOpportunity()
              slug: true,
              name: true,
              pluginUrl: true,
              shortDescription: true,
              author: true,
              testedUpTo: true,
              requiresWpVersion: true,
              requiresPhp: true,
            },
          },
        },
      },
    },
  });

  let scored = 0;

  for (const cat of categories) {
    const plugins: PluginMetrics[] = cat.plugins.map(({ plugin: p }) => ({
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
    }));

    const result = categoryOpportunity(plugins);

    await prisma.pluginCategory.update({
      where: { id: cat.id },
      data: {
        opportunityScore: result.score,
        opportunityTier: parseOpportunityTier(result.tier),
        pluginCount: plugins.length,
      },
    });

    scored += 1;
  }

  return scored;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function runCategorization() {
  const prisma = await getPrisma();

  console.log("[categorize] Phase 1: building taxonomy…");
  const { taxonomy, inserted: taxonomyCount } = await buildTaxonomy(prisma);
  console.log(`[categorize] Taxonomy: ${taxonomyCount} category pairs inserted.`);

  console.log("[categorize] Phase 2: classifying plugins…");
  const classified = await classifyAllPlugins(prisma, taxonomy);
  console.log(`[categorize] Classified: ${classified} plugin-category assignments.`);

  console.log("[categorize] Phase 3: scoring categories…");
  const scored = await scoreCategories(prisma);
  console.log(`[categorize] Scored: ${scored} categories.`);

  return { taxonomy: taxonomyCount, classified, scored };
}
