import { NextResponse } from "next/server";
import { runCategorization } from "@/lib/server/categorize";

export const maxDuration = 300;

export async function POST() {
  try {
    const stats = await runCategorization();
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Categorization failed";
    console.error("[/api/categorize] error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
