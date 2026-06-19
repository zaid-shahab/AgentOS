import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { supabase } from "./supabase";

function chunk(text: string, size = 500, overlap = 100): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks.filter((c) => c.trim().length > 20);
}

export async function embedAndSave(
  text: string,
  accountId: string,
  source = "chat"
): Promise<number> {
  const chunks = chunk(text);
  if (chunks.length === 0) return 0;

  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: chunks,
  });

  const rows = chunks.map((content, i) => ({
    account_id: accountId,
    content,
    source,
    embedding: embeddings[i],
  }));

  const { error } = await supabase.from("knowledge_base").insert(rows);
  if (error) throw new Error(error.message);
  return chunks.length;
}
