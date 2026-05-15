import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/prisma";

export async function GET() {
  try {
    const prisma = await getPrisma();
    const run = await prisma.crawlRun.findFirst({
      orderBy: { id: "desc" },
    });

    if (!run) {
      return NextResponse.json({ ok: true, run: null });
    }

    const [pending, processing, completed, failed] = await Promise.all([
      prisma.searchQuery.count({ where: { runId: run.id, status: "pending" } }),
      prisma.searchQuery.count({ where: { runId: run.id, status: "processing" } }),
      prisma.searchQuery.count({ where: { runId: run.id, status: "completed" } }),
      prisma.searchQuery.count({ where: { runId: run.id, status: "failed" } }),
    ]);

    const topCategories = await prisma.pluginCategory.findMany({
      where: { opportunityScore: { not: null } },
      orderBy: [{ opportunityScore: "desc" }, { id: "asc" }],
      take: 12,
      include: {
        plugins: {
          take: 10,
          orderBy: { plugin: { activeInstalls: "desc" } },
          include: { plugin: true },
        },
      },
    });

    const topPlugins = await prisma.plugin.findMany({
      orderBy: [{ opportunityScore: "desc" }, { id: "asc" }],
      take: 12,
    });

    const queriesRaw = await prisma.searchQuery.findMany({
      where: { runId: run.id },
      select: {
        id: true,
        queryText: true,
        queryType: true,
        status: true,
        opportunityScore: true,
        opportunityTier: true,
        lowDemandSignal: true,
        lastError: true,
      },
      take: 300,
    });

    const statusOrder: Record<string, number> = { pending: 0, processing: 1, completed: 2, failed: 3, skipped: 4 };
    const queries = [...queriesRaw].sort((a, b) => {
      const so = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
      if (so !== 0) return so;
      if (a.status === "completed" && b.status === "completed") {
        return (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0);
      }
      return a.id - b.id;
    });

    return NextResponse.json({
      ok: true,
      run,
      stats: { pending, processing, completed, failed },
      topCategories,
      topPlugins,
      queries,
    });
  } catch (error) {
    let message = "Failed to load run";
    let stack: string | undefined;
    if (error instanceof Error) {
      message = error.message;
      stack = error.stack;
    } else if (typeof error === "string") {
      message = error;
    } else {
      try {
        message = JSON.stringify(error, null, 2).substring(0, 200);
      } catch {
        message = "Unknown error (non-serializable)";
      }
    }
    console.error("API /api/runs/latest error:", message);
    if (stack) {
      console.error("Stack trace:", stack);
    }
    
    // Database not configured error
    if (message.includes("DATABASE_URL") || message.includes("DB_SECRET") || message.includes("AWS")) {
      return NextResponse.json({
        ok: false,
        error: "Database not configured. Set DATABASE_URL in .env.local or configure AWS Secrets Manager.",
        details: message
      }, { status: 503 });
    }
    
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
