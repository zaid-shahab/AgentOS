import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { InsightQuerySchema } from "@/lib/schema";
import { supabase } from "@/lib/supabase";

// Postgres schema exposed to the LLM for Text-to-SQL
const DB_SCHEMA = `
Table: interactions
  id            uuid primary key
  account_id    text
  platform      text   -- instagram_comment | instagram_dm | messenger_dm
  sender_id     text
  message       text
  sentiment     text   -- Positive | Neutral | Negative | Hostile
  intent_tag    text   -- Pricing | Support | Troll | Lead | Spam
  action_taken  text
  created_at    timestamptz
`;

const SYSTEM_PROMPT = `You are a Text-to-SQL engine for OmniForge.
Convert the user's natural-language analytics question into a read-only SQL query against the schema below.
Always filter by account_id = '{{ACCOUNT_ID}}'.
Never use DROP, DELETE, UPDATE, INSERT, or any mutation.
Return only SELECT queries.

${DB_SCHEMA}`;

export async function POST(req: NextRequest) {
  const { question, accountId = "demo" } = await req.json();

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const { object: insight } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: InsightQuerySchema,
    system: SYSTEM_PROMPT.replace("{{ACCOUNT_ID}}", accountId),
    prompt: question,
  });

  // Execute the generated SQL (read-only)
  const { data, error } = await supabase.rpc("run_readonly_query", {
    query: insight.sql,
  });

  if (error) {
    return NextResponse.json({ error: error.message, sql: insight.sql }, { status: 500 });
  }

  return NextResponse.json({
    answer: insight.explanation,
    sql: insight.sql,
    data,
  });
}
