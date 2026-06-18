import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { CronJobSchema } from "@/lib/schema";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { supabase } from "@/lib/supabase";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const reportQueue = new Queue("reports", { connection });

const SYSTEM_PROMPT = `You are AgentOS's Cron Scheduler.
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

  // Save to Supabase for persistent display
  await supabase.from("cron_jobs").insert({
    account_id:      accountId,
    name:            cronJob.name,
    cron_expression: cronJob.cron_expression,
    report_type:     cronJob.report_type,
    delivery:        cronJob.delivery,
    delivery_target: cronJob.delivery_target ?? null,
    description:     cronJob.description,
  });

  // Also add to BullMQ for actual execution
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
  const { data, error } = await supabase
    .from("cron_jobs")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data });
}

export async function DELETE(req: NextRequest) {
  const { jobId } = await req.json();

  // Remove from BullMQ
  await reportQueue.removeRepeatableByKey(jobId).catch(() => {});

  // Remove from Supabase
  await supabase.from("cron_jobs").delete().eq("id", jobId);

  return NextResponse.json({ success: true });
}
