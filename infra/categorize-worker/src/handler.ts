import type { SQSHandler, SQSEvent } from "aws-lambda";
import { runCategorization, type ProgressEvent } from "@/lib/server/categorize";
import { getPrisma } from "@/lib/server/prisma";

interface JobMessage {
  jobId: number;
}

function parseMessage(body: string): JobMessage {
  const parsed: unknown = JSON.parse(body);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { jobId?: unknown }).jobId !== "number"
  ) {
    throw new Error(`Invalid SQS message body — expected { jobId: number }, got: ${body}`);
  }
  return parsed as JobMessage;
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const { jobId } = parseMessage(record.body);
    console.log(`[worker] Processing categorization job ${jobId}`);

    const prisma = await getPrisma();

    await prisma.categorizationJob.update({
      where: { id: jobId },
      data: { status: "processing", startedAt: new Date(), lastError: null },
    });

    // Throttled progress writes — DB update at most every ~3s
    let lastWriteAt = 0;
    const PROGRESS_INTERVAL_MS = 3000;

    const onProgress = async (ev: ProgressEvent) => {
      const now = Date.now();
      const isFinalScore =
        ev.phase === "score" && "scored" in ev && ev.scored === ev.total;
      if (!isFinalScore && now - lastWriteAt < PROGRESS_INTERVAL_MS) return;
      lastWriteAt = now;

      const data: Record<string, unknown> = { phase: ev.phase };
      if (ev.phase === "taxonomy") {
        data.taxonomyCount = ev.taxonomyCount;
      } else if (ev.phase === "classify") {
        data.processedCount = ev.processed;
        data.totalPlugins = ev.total;
        data.classifiedCount = ev.classified;
      } else if (ev.phase === "score") {
        data.processedCount = ev.scored;
        data.totalPlugins = ev.total;
      }
      try {
        await prisma.categorizationJob.update({ where: { id: jobId }, data });
      } catch (err) {
        console.warn("[worker] progress update failed:", err);
      }
    };

    try {
      const stats = await runCategorization(onProgress);
      await prisma.categorizationJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          completedAt: new Date(),
          taxonomyCount: stats.taxonomy,
          classifiedCount: stats.classified,
          phase: "done",
        },
      });
      console.log(`[worker] Job ${jobId} completed:`, stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Job ${jobId} failed:`, err);
      await prisma.categorizationJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          completedAt: new Date(),
          lastError: message.slice(0, 65000),
        },
      });
      throw err; // let SQS retry policy handle it (DLQ after maxReceiveCount)
    }
  }
};
