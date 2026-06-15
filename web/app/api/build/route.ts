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
- Each action should link to its evaluation via linked_evaluation_id
- intent_tag should be short: Pricing, Troll, Support, Lead, Spam
- Be concise in descriptions (max 60 chars)`;

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
