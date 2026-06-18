import { NextRequest, NextResponse } from "next/server";
import { generateObject, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { InsightQuerySchema } from "@/lib/schema";
import { supabase } from "@/lib/supabase";

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

Table: leads
  id            uuid primary key
  account_id    text
  sender_id     text
  message       text
  intent_tag    text
  created_at    timestamptz
`;

const SQL_PROMPT = `You are a Text-to-SQL engine for OmniForge.
Convert the user's natural-language analytics question into a read-only SQL query against the schema below.
Always filter by account_id = '{{ACCOUNT_ID}}'.
Never use DROP, DELETE, UPDATE, INSERT, or any mutation.
Return only SELECT queries.

${DB_SCHEMA}`;

const ANSWER_PROMPT = `You are an analytics assistant for OmniForge.
The user asked a question. You ran a SQL query and got results.
Answer the user's question in one or two plain-English sentences using the actual data.
Be specific — include the actual numbers from the results.
If the result is empty, say "No data found for that query."`;

export async function POST(req: NextRequest) {
  const { question, accountId = "demo" } = await req.json();

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  // Step 1 — Generate SQL from question
  const { object: insight } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: InsightQuerySchema,
    system: SQL_PROMPT.replace("{{ACCOUNT_ID}}", accountId),
    prompt: question,
  });

  // Step 2 — Execute SQL against Supabase
  const { data, error } = await supabase.rpc("run_readonly_query", {
    query: insight.sql,
  });

  if (error) {
    return NextResponse.json({ error: error.message, sql: insight.sql }, { status: 500 });
  }

  // Step 3 — Interpret results into a plain-English answer
  const { text: answer } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: ANSWER_PROMPT,
    prompt: `User question: "${question}"\n\nSQL results: ${JSON.stringify(data)}`,
  });

  return NextResponse.json({ answer, sql: insight.sql, data });
}
