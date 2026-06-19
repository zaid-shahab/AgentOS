import axios from "axios";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import type { AutomationConfig } from "./types";

const client = new Anthropic();
const META_BASE = "https://graph.facebook.com/v21.0";
const PAGE_TOKEN = process.env.META_PAGE_ACCESS_TOKEN!;

interface Context {
  text: string;
  senderId: string;
  platform: string;
  sentiment: string;
  intent_tag: string;
  accountId: string;
}

export async function executeConfig(config: AutomationConfig, ctx: Context): Promise<string> {
  // Find matching evaluation
  const evaluation = config.evaluations.find((ev) => {
    const lower = ctx.intent_tag.toLowerCase();
    return ev.intent_tag.toLowerCase() === lower || ctx.sentiment === "Hostile";
  });

  // Find linked action, or fallback to first action
  const action = evaluation
    ? config.actions.find((a) => a.linked_evaluation_id === evaluation.id)
    : config.actions[0];

  if (!action) return "no_match";

  switch (action.type) {
    case "send_dm": {
      const reply = (action.payload?.message as string) || "Thanks for reaching out!";
      await sendDM(ctx.senderId, reply);
      return "send_dm";
    }

    case "hide_comment": {
      await hideComment(ctx.senderId);
      return "hide_comment";
    }

    case "tag_lead": {
      await supabase.from("leads").insert({
        account_id: ctx.accountId,
        sender_id:  ctx.senderId,
        message:    ctx.text,
        intent_tag: ctx.intent_tag,
      });
      return "tag_lead";
    }

    case "rag_query": {
      const reply = await ragAndReply(ctx.text, ctx.accountId);
      await sendDM(ctx.senderId, reply);
      return "rag_query";
    }

    case "alert_webhook": {
      const url = action.payload?.url as string;
      if (url) await axios.post(url, { ...ctx, config_name: config.name });
      return "alert_webhook";
    }

    case "no_action":
    default:
      return "no_action";
  }
}

async function sendDM(recipientId: string, message: string) {
  await axios.post(`${META_BASE}/me/messages`, {
    recipient: { id: recipientId },
    message: { text: message },
    access_token: PAGE_TOKEN,
  });
}

async function hideComment(commentId: string) {
  await axios.post(`${META_BASE}/${commentId}`, {
    is_hidden: true,
    access_token: PAGE_TOKEN,
  });
}

async function embedText(text: string): Promise<number[]> {
  const res = await axios.post(
    "https://api.openai.com/v1/embeddings",
    { input: text, model: "text-embedding-3-small" },
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
  );
  return res.data.data[0].embedding;
}

async function ragAndReply(question: string, accountId: string): Promise<string> {
  let context = "";
  try {
    const queryEmbedding = await embedText(question);
    const { data } = await supabase.rpc("match_knowledge", {
      query_embedding: queryEmbedding,
      match_account: accountId,
      match_count: 5,
    });
    context = data?.map((r: any) => r.content).join("\n\n") ?? "";
  } catch {
    // Fallback: keyword scan if embedding fails (e.g. OPENAI_API_KEY not set)
    const { data } = await supabase
      .from("knowledge_base")
      .select("content")
      .eq("account_id", accountId)
      .limit(5);
    context = data?.map((r: any) => r.content).join("\n\n") ?? "";
  }

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: `You are a helpful customer support agent. Use only the context below to answer.
If the answer isn't in the context, say you'll follow up shortly.
Context:\n${context}`,
    messages: [{ role: "user", content: question }],
  });

  return (msg.content[0] as any).text;
}
