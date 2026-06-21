import { NextRequest, NextResponse } from "next/server";
import { generateText, embed } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { supabase } from "@/lib/supabase";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Extract meaningful keywords from a natural-language query */
function keywords(text: string): string[] {
  const stop = new Set([
    "what","is","are","the","a","an","of","in","on","at","to","for","and","or",
    "how","do","does","can","i","you","me","my","your","its","this","that","it",
    "tell","about","give","show","with","from","have","has","been","was","will",
    "get","which","who","where","when","why","they","we","our","any","some",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w))
    .slice(0, 6);
}

/**
 * Vector search via pgvector (needs OPENAI_API_KEY).
 * Returns up to `limit` content strings, or [] on failure.
 */
async function vectorSearch(
  query: string,
  accountId: string,
  limit = 6
): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) return [];
  try {
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });
    const { data } = await supabase.rpc("match_knowledge", {
      query_embedding: embedding,
      match_account: accountId,
      match_count: limit,
    });
    return (data ?? []).map((c: { content: string }) => c.content);
  } catch (e) {
    console.warn("[widget-chat] vector search failed:", e);
    return [];
  }
}

/**
 * Keyword fallback — searches knowledge_base.content with ilike.
 * Works even when embeddings are null (e.g. no OPENAI_API_KEY during crawl).
 */
async function keywordSearch(
  query: string,
  accountId: string,
  limit = 8
): Promise<string[]> {
  const kws = keywords(query);
  if (kws.length === 0) {
    // No keywords: just grab the most recent chunks so the bot has something
    const { data } = await supabase
      .from("knowledge_base")
      .select("content")
      .eq("account_id", accountId)
      .order("id", { ascending: false })
      .limit(limit);
    return (data ?? []).map((r: { content: string }) => r.content);
  }

  // Build an OR filter: content ilike %kw1% OR content ilike %kw2% …
  const orFilter = kws.map((k) => `content.ilike.%${k}%`).join(",");
  const { data } = await supabase
    .from("knowledge_base")
    .select("content")
    .eq("account_id", accountId)
    .or(orFilter)
    .limit(limit);

  return (data ?? []).map((r: { content: string }) => r.content);
}

// ── POST /api/widget-chat ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { message, accountId = "demo", history = [] } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // 1. Try vector search first (best quality, needs OpenAI key + embeddings)
    let chunks = await vectorSearch(message, accountId);

    // 2. Fall back to keyword search if vector returned nothing
    //    (covers: no API key, null embeddings from crawl, or low similarity)
    if (chunks.length === 0) {
      chunks = await keywordSearch(message, accountId);
    }

    const context = chunks.join("\n\n---\n\n");

    // 3. Build system prompt
    const systemPrompt = `You are a helpful business assistant answering visitor questions on behalf of this business.
${
  context
    ? `\nKnowledge Base (use this to answer):\n${context}`
    : "\nNo knowledge base content is available yet — tell the visitor you don't have that information right now and suggest they contact support."
}

Rules:
- Be concise, warm, and helpful (2-4 sentences max per reply)
- Answer directly from the knowledge base when possible; if the exact info isn't there, say so clearly
- Plain text only — no markdown headers, no bullet symbols, no asterisks
- Never make up prices, product names, or policies not found in the knowledge base
- Stay focused on questions relevant to this business`;

    // 4. Generate reply
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
