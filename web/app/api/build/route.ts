import { NextRequest, NextResponse } from "next/server";
import { generateObject, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { AutomationConfigSchema } from "@/lib/schema";
import { configToGraph } from "@/lib/configToGraph";
import { supabase } from "@/lib/supabase";

const SYSTEM_PROMPT = `You are OmniForge's Generative Engine.
Convert the user's plain-English description into a strict JSON automation config for Meta platforms (Instagram and Messenger only).

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

  // Step 1 — guard: reject prompts unrelated to Meta platforms
  const { text: check } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: `You are a classifier. Reply with only YES or NO.
Is the following request about automating Instagram comments, Instagram DMs, or Messenger DMs?`,
    prompt,
  });

  if (check.trim().toUpperCase().startsWith("NO")) {
    return NextResponse.json(
      { error: "I can only build agents for Instagram and Messenger. Try: \"Watch IG comments. If someone asks for price, DM them.\"" },
      { status: 422 }
    );
  }

  // Step 2 — generate the config
  let config;
  try {
    const result = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: AutomationConfigSchema,
      system: SYSTEM_PROMPT,
      prompt,
    });
    config = result.object;
  } catch {
    return NextResponse.json(
      { error: "Could not generate a valid agent from that prompt. Please be more specific about the platform and actions." },
      { status: 422 }
    );
  }

  const graph = configToGraph(config);

  await supabase.from("automation_configs").upsert({
    account_id: accountId,
    config,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json(graph);
}
