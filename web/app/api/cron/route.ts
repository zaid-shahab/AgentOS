import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { CronJobSchema } from "@/lib/schema";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const reportQueue = new Queue("reports", { connection });

const SYSTEM_PROMPT = `You are OmniForge's Cron Scheduler.
Convert the user's natural-language schedule request into a structured cron job config.
cron_expression must be standard 5-part cron syntax (e.g., "0 9 * * *" for 9 AM daily).
report_type must be one of: hot_leads, sentiment_summary, interaction_count, custom.
delivery must be one of: email, webhook, in_app.`;

export async function POST(req: NextRequest) {
  const { prompt, accountId = "demo" } = await req.json();

  const { object: cronJob } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: CronJobSchema,
    system: SYSTEM_PROMPT,
    prompt,
  });

  // Add repeatable job to BullMQ
  await reportQueue.add(
    cronJob.name,
    { cronJob, accountId },
    {
      repeat: { pattern: cronJob.cron_expression },
      jobId: `${accountId}-${cronJob.name}`,
    }
  );

  return NextResponse.json({ success: true, cronJob });
}

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId") || "demo";
  const repeatableJobs = await reportQueue.getRepeatableJobs();
  const jobs = repeatableJobs.filter((j) => j.id?.startsWith(accountId));
  return NextResponse.json({ jobs });
}

export async function DELETE(req: NextRequest) {
  const { jobId } = await req.json();
  await reportQueue.removeRepeatableByKey(jobId);
  return NextResponse.json({ success: true });
}
