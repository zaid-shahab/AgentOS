import { NextRequest, NextResponse } from "next/server";
import { generateObject, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { AutomationConfigSchema } from "@/lib/schema";
import { configToGraph } from "@/lib/configToGraph";
import { supabase } from "@/lib/supabase";

const SYSTEM_PROMPT = `You are AgentOS's Generative Engine.
Convert the user's plain-English description into a strict JSON automation config for Meta platforms (Instagram and Facebook/Messenger).

Rules:
- platform must be one of: instagram_comment, instagram_dm, messenger_dm, facebook_comment, facebook_post, instagram_post
  - instagram_comment: comments on Instagram posts
  - instagram_dm: direct messages to the Instagram account
  - messenger_dm: direct messages via Facebook Messenger
  - facebook_comment: comments on Facebook Page posts
  - facebook_post: new posts published on the Facebook Page
  - instagram_post: new posts published on the Instagram account
- action types must be one of: send_dm, reply_comment, hide_comment, tag_lead, rag_query, alert_webhook, send_email, no_action
  - send_dm: slide into the commenter/user's DMs (works on instagram_comment, instagram_dm, messenger_dm, facebook_comment)
  - reply_comment: post a public reply directly in the comment thread (only for instagram_comment and facebook_comment triggers)
  - hide_comment: hide the comment from public view (only for instagram_comment and facebook_comment triggers)
- intent_tag should be short: Pricing, Troll, Support, Lead, Spam, Hostile, Angry, Shipping, General
- Be concise in descriptions (max 60 chars)

Evaluation rules:
- Only create evaluations when the user describes a CONDITIONAL action (e.g. "if someone asks for price", "if the comment is toxic")
- If the action is unconditional (e.g. "reply to every DM", "always send a greeting"), set evaluations to an empty array []
- Each action that has a condition must set linked_evaluation_id to the matching evaluation's id
- Each action that is unconditional must leave linked_evaluation_id undefined

Examples:
- "Reply to every DM with a greeting" → evaluations: [], actions: [{ type: send_dm, no linked_evaluation_id }]
- "If someone asks for price, DM them. Hide toxic comments." → evaluations: [Pricing, Troll], actions linked to each
- "Watch Facebook comments, hide toxic ones" → trigger: facebook_comment, evaluations: [Troll], actions: [hide_comment]`;

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId") ?? "demo";
  const { data } = await supabase
    .from("automation_configs")
    .select("config")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data?.config) return NextResponse.json({ nodes: [], edges: [], config: null });

  try {
    const graph = configToGraph(data.config);
    return NextResponse.json(graph);
  } catch {
    return NextResponse.json({ nodes: [], edges: [], config: null });
  }
}

export async function POST(req: NextRequest) {
  const { prompt, accountId = "demo" } = await req.json();

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // Step 1 — guard: reject prompts unrelated to Meta platforms
  const { text: check } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: `You are a classifier. Reply with only YES or NO.
Is the following request about automating Instagram (comments, DMs, posts), Facebook Page (comments, posts), or Messenger DMs?`,
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
