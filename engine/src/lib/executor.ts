import axios from "axios";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import type { AutomationConfig } from "./types";

const client = new Anthropic();
const META_BASE = "https://graph.facebook.com/v21.0";
const PAGE_TOKEN = process.env.META_PAGE_ACCESS_TOKEN!;

interface Context {
  text: string;
  senderId: string;   // user/author ID — used for send_dm
  commentId?: string; // comment object ID — used for hide_comment
  platform: string;
  sentiment: string;
  intent_tag: string;
  accountId: string;
}

export async function executeConfig(config: AutomationConfig, ctx: Context): Promise<string> {
  console.log(`[executor] matching — intent_tag:"${ctx.intent_tag}" sentiment:"${ctx.sentiment}" platform:"${ctx.platform}"`);
  console.log(`[executor] config evaluations:`, JSON.stringify(config.evaluations?.map(e => e.intent_tag)));
  console.log(`[executor] config actions:`, JSON.stringify(config.actions?.map(a => ({ type: a.type, linked: a.linked_evaluation_id }))));

  // Find matching evaluation
  const evaluation = config.evaluations.find((ev) => {
    const lower = ctx.intent_tag.toLowerCase();
    return ev.intent_tag.toLowerCase() === lower || ctx.sentiment === "Hostile";
  });

  // Find linked action, or fallback to first action
  const action = evaluation
    ? config.actions.find((a) => a.linked_evaluation_id === evaluation.id)
    : config.actions[0];

  console.log(`[executor] matched evaluation:`, evaluation?.intent_tag ?? "none", "| action:", action?.type ?? "none");
  if (!action) return "no_match";

  switch (action.type) {
    case "send_dm": {
      // Post-type triggers don't support cold outbound DMs — Messenger's 24-hour policy
      // requires the user to have messaged first, and self-messaging a Page is rejected.
      // Fall back to tagging the post author as a lead instead.
      if (ctx.platform === "facebook_post" || ctx.platform === "instagram_post") {
        await supabase.from("leads").insert({
          account_id: ctx.accountId,
          sender_id:  ctx.senderId,
          message:    ctx.text,
          intent_tag: ctx.intent_tag,
        });
        return "tag_lead_from_post";
      }
      const dmText = (action.payload?.message as string) || "Thanks for reaching out!";
      if (ctx.platform === "facebook_comment") {
        // Facebook comment → private reply API (shows comment context in Messenger).
        // If commentId is missing for any reason, skip rather than sending a blind cold DM.
        if (!ctx.commentId) return "no_action";
        await facebookPrivateReply(ctx.commentId, dmText);
      } else {
        // Instagram comment or DM → standard messages API.
        // Instagram automatically adds "replied because you commented on their post" context.
        await sendDM(ctx.senderId, dmText);
      }
      return "send_dm";
    }

    case "reply_comment": {
      if (!ctx.commentId) return "no_action";
      const replyText = (action.payload?.message as string) || "Thanks for your comment!";
      await replyToComment(ctx.commentId, ctx.platform, replyText);
      return "reply_comment";
    }

    case "hide_comment": {
      if (!ctx.commentId) return "no_action"; // can't hide without the comment's own ID
      await hideComment(ctx.commentId);
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
      // Post triggers can't receive DMs — log the intent and move on
      if (ctx.platform === "facebook_post" || ctx.platform === "instagram_post") {
        return "no_action";
      }
      const reply = await ragAndReply(ctx.text, ctx.accountId);
      await sendDM(ctx.senderId, reply);
      return "rag_query";
    }

    case "alert_webhook": {
      const url = action.payload?.url as string;
      if (url) await axios.post(url, { ...ctx, config_name: config.name });
      return "alert_webhook";
    }

    case "send_email":
      // Not implemented — email delivery is not wired up in the engine yet.
      console.warn("[executor] send_email action is not implemented; treating as no_action");
      return "no_action";

    case "no_action":
    default:
      return "no_action";
  }
}

async function sendDM(recipientId: string, message: string) {
  try {
    const res = await axios.post(`${META_BASE}/me/messages`, {
      recipient: { id: recipientId },
      message: { text: message },
      access_token: PAGE_TOKEN,
    });
    console.log("[executor] sendDM success:", JSON.stringify(res.data));
  } catch (err: any) {
    console.error("[executor] sendDM FAILED:", err?.response?.data ?? err?.message);
    throw err;
  }
}

async function hideComment(commentId: string) {
  await axios.post(`${META_BASE}/${commentId}`, {
    is_hidden: true,
    access_token: PAGE_TOKEN,
  });
}

async function replyToComment(commentId: string, platform: string, message: string) {
  if (platform === "instagram_comment") {
    // Instagram: public reply in the comment thread
    await axios.post(`${META_BASE}/${commentId}/replies`, {
      message,
      access_token: PAGE_TOKEN,
    });
  } else if (platform === "facebook_comment") {
    // Facebook: public reply in the comment thread
    await axios.post(`${META_BASE}/${commentId}/comments`, {
      message,
      access_token: PAGE_TOKEN,
    });
  }
  // No-op for DM/post platforms — reply_comment doesn't apply
}

async function facebookPrivateReply(commentId: string, message: string) {
  // Sends a Messenger DM to the commenter — Facebook shows it as a private reply to their comment.
  await axios.post(`${META_BASE}/${commentId}/private_replies`, {
    message,
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

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: `You are a helpful customer support agent. Use only the context below to answer.
If the answer isn't in the context, say you'll follow up shortly.
Context:\n${context}`,
      messages: [{ role: "user", content: question }],
    });
    return (msg.content[0] as any).text;
  } catch {
    return "Thanks for your question — we'll follow up with you shortly.";
  }
}
