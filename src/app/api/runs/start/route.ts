import { NextResponse } from "next/server";
import { z } from "zod";
import { createRunWithGeneratedQueries } from "@/lib/server/processor";

const bodySchema = z.object({
  queryTarget: z.number().int().min(10).max(250).default(100),
  topN: z.number().int().min(3).max(10).default(10),
  seed: z.array(z.string().min(2)).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.parse(body);

    const result = await createRunWithGeneratedQueries({
      queryTarget: parsed.queryTarget,
      topN: parsed.topN,
      seed: parsed.seed,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid request payload", issues: error.issues }, { status: 400 });
    }

    let message = "Failed to create run";
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === "string") {
      message = error;
    } else {
      message = JSON.stringify(error, null, 2).substring(0, 200);
    }
    console.error("API /api/runs/start error:", message);

    if (message.includes("OpenRouter API key is not configured")) {
      return NextResponse.json({ ok: false, error: "OpenRouter API key is not configured. Add OPENROUTER_API_KEY to AWS Secrets Manager." }, { status: 503 });
    }

    if (message.includes("OpenRouter") && message.includes("status 401")) {
      return NextResponse.json({ ok: false, error: "OpenRouter authentication failed (401). Please check OPENROUTER_API_KEY." }, { status: 502 });
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
