import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/prisma";

export async function GET() {
  try {
    const prisma = await getPrisma();

    const categories = await prisma.pluginCategory.findMany({
      where: { opportunityScore: { not: null } },
      orderBy: [{ opportunityScore: "desc" }, { id: "asc" }],
      include: {
        plugins: {
          take: 10,
          orderBy: { plugin: { activeInstalls: "desc" } },
          include: {
            plugin: {
              select: {
                id: true,
                name: true,
                slug: true,
                pluginUrl: true,
                activeInstalls: true,
                ratingCount: true,
                rating: true,
                demandScore: true,
                competitionScore: true,
                satisfactionScore: true,
                freshnessScore: true,
                opportunityScore: true,
                opportunityTier: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ ok: true, categories });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load categories";
    console.error("[/api/categories]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
