import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { CronJobSchema } from "@/lib/schema";
import { supabase } from "@/lib/supabase";

const BASE_PROMPT = `You are AgentOS's Cron Scheduler.
Convert the user's natural-language schedule request into a structured cron job config.
cron_expression must be standard 5-part cron syntax (e.g., "0 9 * * *" for 9 AM daily).
report_type must be one of: hot_leads, sentiment_summary, interaction_count, custom.
delivery must be one of: email, webhook, in_app.

run_once: Set to true ONLY if the user clearly wants the report to run a single time
(e.g. "after 10 minutes", "in 2 hours", "just once", "one time", "right now").
For "after X minutes/hours", calculate the cron expression based on the current UTC time.
For recurring requests ("every day", "every 2 hours", "daily at 9am"), set run_once to false.`;

export async function POST(req: NextRequest) {
  const { prompt, accountId = "demo" } = await req.json();

  // Build prompt at request time so the UTC timestamp is accurate
  const system = `${BASE_PROMPT}\n\nCurrent UTC time for reference: ${new Date().toUTCString()}`;

  const { object: cronJob } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: CronJobSchema,
    system,
    prompt,
  });

  await supabase.from("cron_jobs").insert({
    account_id:      accountId,
    name:            cronJob.name,
    cron_expression: cronJob.cron_expression,
    report_type:     cronJob.report_type,
    delivery:        cronJob.delivery,
    delivery_target: cronJob.delivery_target ?? null,
    description:     cronJob.description,
    run_once:        cronJob.run_once ?? false,
  });

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
  const { jobId, all, accountId } = await req.json();

  if (all) {
    // Delete all jobs for an account
    await supabase.from("cron_jobs").delete().eq("account_id", accountId ?? "demo");
  } else {
    await supabase.from("cron_jobs").delete().eq("id", jobId);
  }

  return NextResponse.json({ success: true });
}
