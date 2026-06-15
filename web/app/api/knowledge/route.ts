import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { supabase } from "@/lib/supabase";

// Chunk text into ~500-char pieces with overlap
function chunk(text: string, size = 500, overlap = 100): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}

export async function POST(req: NextRequest) {
  const { text, accountId = "demo" } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  const chunks = chunk(text);

  const rows = await Promise.all(
    chunks.map(async (content) => {
      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: content,
      });
      return { account_id: accountId, content, embedding };
    })
  );

  const { error } = await supabase.from("knowledge_base").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, chunks: rows.length });
}
