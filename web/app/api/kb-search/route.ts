import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Debug endpoint — returns exactly what the widget-chat RAG would find
 * for a given query, without calling Claude.
 * GET /api/kb-search?q=digital+connects&accountId=demo
 */
export async function GET(req: NextRequest) {
  const q         = req.nextUrl.searchParams.get("q") ?? "";
  const accountId = req.nextUrl.searchParams.get("accountId") ?? "demo";

  // Keyword search (same logic as widget-chat)
  const STOP = new Set([
    "what","is","are","the","a","an","of","in","on","at","to","for","and","or",
    "how","do","does","can","i","you","me","my","your","its","this","that","it",
    "tell","about","give","show","with","from","have","has","been","was","will",
    "get","which","who","where","when","why","they","we","our","any","some",
  ]);
  const kws = q.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w)).slice(0, 8);

  let keywordResults: { content: string; source: string }[] = [];
  if (kws.length > 0) {
    const orFilter = kws.map(k => `content.ilike.%${k}%`).join(",");
    const { data } = await supabase
      .from("knowledge_base")
      .select("content, source")
      .eq("account_id", accountId)
      .or(orFilter)
      .limit(10);
    keywordResults = data ?? [];
  }

  // Also get total row count for this account
  const { count } = await supabase
    .from("knowledge_base")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId);

  // Get a sample of what sources are stored
  const { data: sources } = await supabase
    .from("knowledge_base")
    .select("source, content")
    .eq("account_id", accountId)
    .order("id", { ascending: false })
    .limit(20);

  const uniqueSources = [...new Set((sources ?? []).map(r => r.source))];

  return NextResponse.json({
    query: q,
    keywords: kws,
    totalChunks: count ?? 0,
    sourcesInKB: uniqueSources,
    keywordResults: keywordResults.map(r => ({
      source: r.source,
      preview: r.content.slice(0, 200),
    })),
  });
}
