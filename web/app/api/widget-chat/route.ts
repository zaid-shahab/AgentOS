import { NextRequest, NextResponse } from "next/server";
import { generateText, embed } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { supabase } from "@/lib/supabase";

// ── Stop words for keyword extraction ────────────────────────────────────────
const STOP = new Set([
  "what","is","are","the","a","an","of","in","on","at","to","for","and","or",
  "how","do","does","can","i","you","me","my","your","its","this","that","it",
  "tell","about","give","show","with","from","have","has","been","was","will",
  "get","which","who","where","when","why","they","we","our","any","some","did",
  "please","could","would","should","let","want","need","help","know","find",
  "much","many","use","used","make","made","take","like","just","than","then",
  "but","not","also","more","most","all","very","really","actually","there",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .slice(0, 8);
}

// ── Layer 1: Vector search (best quality, needs OpenAI key + embeddings) ─────
async function vectorSearch(query: string, accountId: string): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) return [];
  try {
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: query,
    });
    const { data } = await supabase.rpc("match_knowledge", {
      query_embedding: embedding,
      match_account: accountId,
      match_count: 6,
    });
    return (data ?? []).map((c: { content: string }) => c.content);
  } catch (e) {
    console.warn("[widget-chat] vector search failed:", e);
    return [];
  }
}

// ── Layer 2: Keyword search (works without OpenAI, finds null-embedding rows) -
async function keywordSearch(query: string, accountId: string): Promise<string[]> {
  const kws = extractKeywords(query);
  if (kws.length === 0) return [];

  // Try progressively fewer keywords until we get results
  for (let take = kws.length; take >= 1; take--) {
    const subset = kws.slice(0, take);
    const orFilter = subset.map((k) => `content.ilike.%${k}%`).join(",");
    const { data } = await supabase
      .from("knowledge_base")
      .select("content")
      .eq("account_id", accountId)
      .or(orFilter)
      .limit(8);
    if (data && data.length > 0)
      return data.map((r: { content: string }) => r.content);
  }
  return [];
}

// ── Layer 3: Recency fallback (always returns something if KB has any data) ───
async function recentChunks(accountId: string): Promise<string[]> {
  const { data } = await supabase
    .from("knowledge_base")
    .select("content, source")
    .eq("account_id", accountId)
    .order("id", { ascending: false })
    .limit(10);
  return (data ?? []).map((r: { content: string }) => r.content);
}

// ── POST /api/widget-chat ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { message, accountId = "demo", history = [] } = await req.json();
    if (!message?.trim())
      return NextResponse.json({ error: "message is required" }, { status: 400 });

    // Try all three layers in order — stop at first that returns data
    let chunks: string[] = await vectorSearch(message, accountId);

    if (chunks.length === 0)
      chunks = await keywordSearch(message, accountId);

    if (chunks.length === 0)
      chunks = await recentChunks(accountId);   // worst case: any KB content

    const context = chunks.join("\n\n---\n\n");
    const hasContext = context.trim().length > 0;

    const systemPrompt = `You are a friendly, knowledgeable assistant for this business. Answer visitor questions based on the knowledge base below.

${hasContext
  ? `KNOWLEDGE BASE:\n${context}`
  : "KNOWLEDGE BASE: (empty — no content has been added yet)"
}

INSTRUCTIONS:
- Answer in 2–4 short sentences. Be warm, direct, and confident.
- Base your answer on the knowledge base above. Pull out specific product names, services, prices, or policies when they appear.
- If the knowledge base doesn't have a specific detail (e.g. exact price), say so briefly and invite the visitor to contact the business.
- Plain text only — no markdown, no bullet points, no asterisks, no headers.
- Do NOT say "based on the knowledge base" or quote the source URL — just answer naturally as if you work there.
- Never invent facts not found in the knowledge base.`;

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
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
