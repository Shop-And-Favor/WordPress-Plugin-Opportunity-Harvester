import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const url = process.env.CATEGORIZE_ENQUEUE_URL;
  const secret = process.env.CATEGORIZE_ENQUEUE_SECRET;
  if (!url || !secret) {
    return NextResponse.json(
      { ok: false, error: "CATEGORIZE_ENQUEUE_URL/SECRET not configured" },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-Shared-Secret": secret },
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enqueue failed";
    console.error("[/api/categorize] enqueue error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
