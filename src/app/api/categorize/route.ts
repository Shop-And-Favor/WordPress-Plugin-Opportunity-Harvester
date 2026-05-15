import { NextResponse } from "next/server";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { getPrisma } from "@/lib/server/prisma";

export const runtime = "nodejs";

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? "eu-west-2" });

export async function POST() {
  const queueUrl = process.env.CATEGORIZE_QUEUE_URL;
  if (!queueUrl) {
    return NextResponse.json(
      { ok: false, error: "CATEGORIZE_QUEUE_URL not configured" },
      { status: 503 },
    );
  }

  try {
    const prisma = await getPrisma();
    const job = await prisma.categorizationJob.create({
      data: { status: "pending" },
    });

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ jobId: job.id }),
      }),
    );

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enqueue failed";
    const stack = error instanceof Error ? error.stack?.slice(0, 1000) : undefined;
    console.error("[/api/categorize] enqueue error:", message, stack);
    return NextResponse.json({ ok: false, error: message, stack }, { status: 500 });
  }
}
