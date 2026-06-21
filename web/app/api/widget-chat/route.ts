import { NextRequest, NextResponse } from "next/server";
import { generateText, embed } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { message, accountId = "demo", history = [] } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // RAG: embed the query and retrieve relevant KB chunks
    let context = "";
    try {
      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: message,
      });

      const { data: chunks } = await supabase.rpc("match_knowledge", {
        query_embedding: embedding,
        match_account: accountId,
        match_count: 5,
      });

      if (chunks && chunks.length > 0) {
        context = (chunks as { content: string }[])
          .map((c) => c.content)
          .join("\n\n");
      }
    } catch (e) {
      console.warn("[widget-chat] RAG lookup failed — answering without KB context:", e);
    }

    const systemPrompt = `You are a helpful business assistant answering visitor questions on behalf of this business.${
      context
        ? `\n\nKnowledge Base (use this to answer questions):\n${context}`
        : "\n\nNo knowledge base content is available yet."
    }

Rules:
- Be concise, warm, and helpful (max 80 words per reply)
- If the exact answer isn't in the knowledge base, acknowledge it and suggest the visitor contact support
- Plain text only — no markdown headers, no bullet symbols, no asterisks
- Stay focused on questions relevant to this business`;

    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: systemPrompt,
      messages: [
        ...history.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: message },
      ],
    });

    return NextResponse.json({ reply: text });
  } catch (e) {
    console.error("[widget-chat] error:", e);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
