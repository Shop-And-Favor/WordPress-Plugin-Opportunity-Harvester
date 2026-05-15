import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/prisma";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    const prisma = await getPrisma();
    const job = await prisma.categorizationJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
