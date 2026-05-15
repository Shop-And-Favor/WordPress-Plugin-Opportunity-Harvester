import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/server/prisma";

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: runId } = paramsSchema.parse(await context.params);
    const prisma = await getPrisma();

    await prisma.searchQuery.updateMany({
      where: { runId, status: "pending" },
      data: { status: "skipped" },
    });

    await prisma.crawlRun.update({
      where: { id: runId },
      data: { status: "completed", completedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stop failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
