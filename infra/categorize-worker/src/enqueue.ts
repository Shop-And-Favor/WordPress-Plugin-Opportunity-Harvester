import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { getPrisma } from "@/lib/server/prisma";

const sqs = new SQSClient({});

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  // Shared-secret auth (Function URL is AuthType=NONE)
  const secret = process.env.ENQUEUE_SHARED_SECRET;
  const headers = event.headers ?? {};
  const provided =
    headers["x-shared-secret"] ?? headers["X-Shared-Secret"] ?? "";
  if (!secret || provided !== secret) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "Unauthorized" }),
    };
  }

  const queueUrl = process.env.CATEGORIZE_QUEUE_URL;
  if (!queueUrl) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "CATEGORIZE_QUEUE_URL not set" }),
    };
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

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, jobId: job.id }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enqueue failed";
    console.error("[enqueue] error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: message }),
    };
  }
};
