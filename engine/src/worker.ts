import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./lib/supabase";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const client = new Anthropic();

const DB_SCHEMA = `
Table: interactions
  id, account_id, platform, sender_id, message, sentiment, intent_tag, action_taken, created_at
`;

const worker = new Worker(
  "reports",
  async (job) => {
    const { cronJob, accountId } = job.data;
    console.log(`Running report: ${cronJob.name} for account ${accountId}`);

    // Generate SQL via LLM
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: `Generate a read-only SQL query for: "${cronJob.description}"
Table schema:${DB_SCHEMA}
Filter by account_id = '${accountId}'.
Return only the SQL string, no explanation.`,
      messages: [{ role: "user", content: cronJob.report_type }],
    });

    const sql = (msg.content[0] as any).text.trim();

    // Execute
    const { data, error } = await supabase.rpc("run_readonly_query", { query: sql });

    if (error) {
      console.error("Report SQL error:", error.message);
      return;
    }

    // Format and deliver
    const summary = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: "Summarize this data in plain English as a concise briefing. Max 3 sentences.",
      messages: [{ role: "user", content: JSON.stringify(data) }],
    });

    const report = (summary.content[0] as any).text;

    if (cronJob.delivery === "webhook" && cronJob.delivery_target) {
      const axios = (await import("axios")).default;
      await axios.post(cronJob.delivery_target, { report, generatedAt: new Date().toISOString() });
    }

    // Always log to in-app notifications table
    await supabase.from("notifications").insert({
      account_id: accountId,
      title: cronJob.name,
      body: report,
    });

    console.log(`Report delivered: ${cronJob.name}`);
  },
  { connection }
);

worker.on("failed", (job, err) => console.error(`Job ${job?.id} failed:`, err));
console.log("Report worker running…");
