import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/prisma";

export async function GET() {
  try {
    const prisma = await getPrisma();

    const rows = await prisma.pluginCategoryMap.findMany({
      where: {
        plugin: {
          opportunityScore: { not: null },
        },
      },
      orderBy: [
        { plugin: { opportunityScore: "desc" } },
        { plugin: { id: "asc" } },
        { categoryId: "asc" },
      ],
      select: {
        id: true,
        plugin: {
          select: {
            id: true,
            name: true,
            slug: true,
            pluginUrl: true,
            shortDescription: true,
            author: true,
            rating: true,
            ratingCount: true,
            activeInstalls: true,
            downloadedCount: true,
            demandScore: true,
            competitionScore: true,
            satisfactionScore: true,
            freshnessScore: true,
            opportunityScore: true,
            opportunityTier: true,
          },
        },
        category: {
          select: {
            id: true,
            category: true,
            subcategory: true,
          },
        },
      },
    });

    const plugins = rows.map((row) => ({
      id: row.id,
      pluginId: row.plugin.id,
      name: row.plugin.name,
      slug: row.plugin.slug,
      pluginUrl: row.plugin.pluginUrl,
      shortDescription: row.plugin.shortDescription,
      author: row.plugin.author,
      rating: row.plugin.rating,
      ratingCount: row.plugin.ratingCount,
      activeInstalls: row.plugin.activeInstalls,
      downloadedCount: row.plugin.downloadedCount,
      demandScore: row.plugin.demandScore,
      competitionScore: row.plugin.competitionScore,
      satisfactionScore: row.plugin.satisfactionScore,
      freshnessScore: row.plugin.freshnessScore,
      opportunityScore: row.plugin.opportunityScore,
      opportunityTier: row.plugin.opportunityTier,
      categoryId: row.category.id,
      category: row.category.category,
      subcategory: row.category.subcategory,
    }));

    return NextResponse.json({ ok: true, plugins });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load plugins";
    console.error("[/api/plugins]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}