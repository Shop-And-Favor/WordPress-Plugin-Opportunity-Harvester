import { NextResponse } from "next/server";
import { z } from "zod";
import { processNextPendingQueries } from "@/lib/server/processor";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const bodySchema = z.object({
  batchSize: z.number().int().min(1).max(50).default(5),
  topN: z.number().int().min(3).max(10).default(10),
  retryFailed: z.boolean().default(false),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsedBody = bodySchema.parse(body);

    const params = await context.params;
    const parsedParams = paramsSchema.parse(params);

    const result = await processNextPendingQueries({
      runId: parsedParams.id,
      batchSize: parsedBody.batchSize,
      topN: parsedBody.topN,
      retryFailed: parsedBody.retryFailed,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Continue failed";    console.error("API /api/runs/[id]/continue error:", message);
    
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
