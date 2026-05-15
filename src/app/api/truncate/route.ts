import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/prisma";

export async function POST() {
  try {
    const prisma = await getPrisma();

    // Delete in dependency order (children before parents)
    await prisma.pluginCategoryMap.deleteMany({});
    await prisma.pluginCategory.deleteMany({});
    await prisma.queryPlugin.deleteMany({});
    await prisma.plugin.deleteMany({});
    await prisma.searchQuery.deleteMany({});
    await prisma.crawlRun.deleteMany({});

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Truncate failed";
    console.error("[/api/truncate] error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
