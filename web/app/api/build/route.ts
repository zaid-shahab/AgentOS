import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { AutomationConfigSchema } from "@/lib/schema";
import { configToGraph } from "@/lib/configToGraph";
import { supabase } from "@/lib/supabase";

const SYSTEM_PROMPT = `You are OmniForge's Generative Engine.
Convert the user's plain-English description into a strict JSON automation config for Meta platforms.

Rules:
- platform must be one of: instagram_comment, instagram_dm, messenger_dm
- action types must be one of: send_dm, hide_comment, tag_lead, rag_query, alert_webhook, send_email, no_action
- intent_tag should be short: Pricing, Troll, Support, Lead, Spam, Hostile, Angry, Shipping, General
- Be concise in descriptions (max 60 chars)

Evaluation rules:
- Only create evaluations when the user describes a CONDITIONAL action (e.g. "if someone asks for price", "if the comment is toxic")
- If the action is unconditional (e.g. "reply to every DM", "always send a greeting"), set evaluations to an empty array []
- Each action that has a condition must set linked_evaluation_id to the matching evaluation's id
- Each action that is unconditional must leave linked_evaluation_id undefined

Examples:
- "Reply to every DM with a greeting" → evaluations: [], actions: [{ type: send_dm, no linked_evaluation_id }]
- "If someone asks for price, DM them. Hide toxic comments." → evaluations: [Pricing, Troll], actions linked to each`;

export async function POST(req: NextRequest) {
  const { prompt, accountId = "demo" } = await req.json();

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const { object: config } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: AutomationConfigSchema,
    system: SYSTEM_PROMPT,
    prompt,
  });

  const graph = configToGraph(config);

  // Persist the config to Supabase so the engine can look it up
  await supabase.from("automation_configs").upsert({
    account_id: accountId,
    config,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json(graph);
}
