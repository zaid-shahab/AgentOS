import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { embedAndSave } from "@/lib/embedAndSave";

const ChatResponseSchema = z.object({
  reply: z.string().describe("The conversational reply to show the user (max ~120 words, plain text, no markdown headers)."),
  kb_save: z.string().optional().describe("Only set this when the user has EXPLICITLY pasted pricing tables, product info, FAQs, or other knowledge content in their message. Extract ALL of it verbatim. Leave undefined otherwise."),
});

const SYSTEM_PROMPT = `You are AgentOS — a conversational assistant that helps users design automation agents for Meta platforms: Instagram (comments, DMs, posts), Facebook Page (comments, posts), and Messenger DMs.

## Your job before building
Fully understand the user's intent. Watch for vagueness and ask clarifying questions:

1. **Specific trigger** — if the user says "my post", "post about X", or any vague post reference WITHOUT giving a URL, post ID, or saying "any/all posts", ask: "Which post do you want to watch? You can give me a link, a post ID, or say 'any post' to monitor all of them."

2. **Product / pricing info** — if the automation involves answering questions about price, products, or FAQs, ask where this info is stored. Say: "Do you have pricing info ready? You can paste it directly here, or upload a PDF/DOCX to the Knowledge Base tab — I'll make sure the bot references it."

3. **Reply content** — if the bot should send a specific message and the wording is unclear, ask for the exact text or instruct the user to store it in the Knowledge Base.

Only ask ONE clarifying question at a time. Do not pile them all at once.

## When the user provides product/pricing data in chat
If they paste pricing tables, product descriptions, FAQs, or any knowledge content into their message, put ALL of it verbatim into \`kb_save\`. In your reply, say: "Got it — I've saved that to your Knowledge Base. The bot will reference it when answering questions."

## Conversation rules
- Natural, friendly tone. Max ~120 words per reply. Plain text, no markdown headers.
- Once you have enough info, summarise the plan as: Trigger → Decision(s) → Action(s).
- Always end a proposal with: "Say 'execute' or 'build it' when you're ready."
- Do NOT claim you have already built the flow — it only draws after "execute".
- If the request is outside Instagram/Facebook/Messenger automation, gently redirect.

## kb_save rules
ONLY populate \`kb_save\` when the user has pasted concrete knowledge content (prices, product names, FAQs, support policies) directly in their message. Never populate it with conversation text or your own words.`;

export async function POST(req: NextRequest) {
  try {
    const { messages, accountId = "demo" } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages is required" }, { status: 400 });
    }

    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: ChatResponseSchema,
      system: SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      })),
    });

    // If the user provided knowledge data in chat, save it to KB with embeddings.
    let reply = object.reply;
    if (object.kb_save?.trim()) {
      try {
        await embedAndSave(object.kb_save, accountId, "chat");
      } catch (e) {
        console.warn("[chat] kb_save failed:", e);
        // Replace the confirmation with a corrective note so the user knows to use the KB tab.
        reply = reply.replace(
          /I('ve| have) saved that to your Knowledge Base[^.]*\./i,
          "I couldn't save that to your Knowledge Base automatically — please paste it in the Knowledge Base tab directly."
        );
        // If the reply didn't contain the save confirmation, append a warning.
        if (!reply.includes("Knowledge Base tab")) {
          reply += " (Note: Knowledge Base save failed — paste it in the Knowledge Base tab instead.)";
        }
      }
    }

    return NextResponse.json({ reply });
  } catch (e) {
    console.error("[chat] generateObject failed:", e);
    return NextResponse.json(
      { error: "I had trouble responding just now. Please try again." },
      { status: 500 }
    );
  }
}
