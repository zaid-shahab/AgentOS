import { NextRequest, NextResponse } from "next/server";
import { parseExpression } from "cron-parser";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { supabase } from "@/lib/supabase";

const DB_SCHEMA = `
Table: interactions
  id, account_id, platform, sender_id, message, sentiment, intent_tag, action_taken, created_at
`;

// Returns true if a job should run now.
// run_once jobs: fire any time after the scheduled time with no expiry window —
//   they auto-delete after running so there is no double-fire risk, and missing
//   the tight window (e.g. GitHub Actions fires late) would lose the job forever.
// Recurring jobs: 10-minute window covers GitHub Actions ~5-min cadence + jitter.
function isDue(cronExpression: string, lastRunAt: string | null, runOnce: boolean): boolean {
  try {
    const now = new Date();
    const interval = parseExpression(cronExpression, { utc: true, currentDate: now });
    const prevTime = interval.prev().toDate();
    const notYetRun = !lastRunAt || new Date(lastRunAt) < prevTime;
    if (runOnce) return notYetRun; // no window — fire whenever we next check after the scheduled time
    const windowMs = 10 * 60 * 1000;
    return now.getTime() - prevTime.getTime() < windowMs && notYetRun;
  } catch {
    return false;
  }
}

async function runReport(job: {
  id: string;
  account_id: string;
  name: string;
  cron_expression: string;
  report_type: string;
  delivery: string;
  delivery_target: string | null;
  description: string;
  run_once: boolean;
}) {
  console.log(`[cron/run] running: ${job.name}`);

  // Mark as started immediately to prevent double-runs
  await supabase
    .from("cron_jobs")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", job.id);

  // Generate SQL for the report
  const { text: sql } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: `Generate a read-only SQL SELECT query.
Report goal: "${job.description}"
Table schema:${DB_SCHEMA}
Always filter by account_id = '${job.account_id}'.
Rules:
- For counts/summaries, use aggregate functions: SELECT COUNT(*) as count FROM ...
- Never SELECT a column alongside an aggregate unless it is also in GROUP BY
- Keep the query simple — prefer COUNT(*) over selecting raw rows
- Return only the raw SQL string, no markdown, no backticks, no explanation`,
    prompt: job.report_type,
  });

  const { data, error } = await supabase.rpc("run_readonly_query", { query: sql.trim() });

  if (error) {
    console.error(`[cron/run] SQL error for ${job.name}:`, error.message);
    await supabase.from("notifications").insert({
      account_id: job.account_id,
      title: `${job.name} — failed`,
      body: `SQL error: ${error.message}`,
    });
    if (job.run_once) await supabase.from("cron_jobs").delete().eq("id", job.id);
    return;
  }

  // Summarise results
  const { text: report } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: "Summarize this data in plain English as a concise briefing. Max 3 sentences.",
    prompt: JSON.stringify(data),
  });

  // Deliver via webhook if configured
  if (job.delivery === "webhook" && job.delivery_target) {
    try {
      await fetch(job.delivery_target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, generatedAt: new Date().toISOString() }),
      });
    } catch (e) {
      console.error(`[cron/run] webhook delivery failed for ${job.name}:`, e);
    }
  }

  // Always save to in-app notifications
  await supabase.from("notifications").insert({
    account_id: job.account_id,
    title: job.name,
    body: report,
  });

  console.log(`[cron/run] delivered: ${job.name}`);

  // Auto-delete one-shot jobs after successful delivery
  if (job.run_once) {
    await supabase.from("cron_jobs").delete().eq("id", job.id);
    console.log(`[cron/run] deleted one-shot job: ${job.name}`);
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: jobs, error } = await supabase
    .from("cron_jobs")
    .select("id, account_id, name, cron_expression, report_type, delivery, delivery_target, description, last_run_at, run_once");

  if (error) {
    console.error("[cron/run] failed to fetch jobs:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (jobs ?? []).filter((j) => isDue(j.cron_expression, j.last_run_at, !!j.run_once));

  console.log(`[cron/run] ${jobs?.length ?? 0} jobs total, ${due.length} due`);

  await Promise.allSettled(due.map((j) => runReport(j)));

  return NextResponse.json({ ran: due.length, jobs: due.map((j) => j.name) });
}
