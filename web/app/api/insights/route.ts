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

const SQL_PROMPT = `You are a Text-to-SQL engine for AgentOS.
Convert the user's natural-language analytics question into a read-only SQL query against the schema below.
Always filter by account_id = '{{ACCOUNT_ID}}'.
Never use DROP, DELETE, UPDATE, INSERT, or any mutation.
Return only SELECT queries.

The user may ask in English, Urdu (Nastaliq script), or Roman Urdu (Urdu written in Latin letters).
Examples of Roman Urdu you should understand:
- "mere insta or messenger mein kitne DMs aye" → count of instagram_dm + messenger_dm rows
- "kitne leads hain" → count of leads table
- "aaj ki interactions dikhao" → today's interactions
Interpret the intent and generate correct SQL regardless of the language used.

Also set render_as based on what the user wants:
- "table" — user asks for a list, table, rows, or details with multiple columns
- "bar_chart" — user asks for a bar chart, graph, or comparison between categories (e.g. sentiment counts, intent breakdown)
- "line_chart" — user asks for a trend, over time, timeline
- "text" — user asks a simple question expecting a number or sentence

${DB_SCHEMA}`;

const ANSWER_PROMPT = `You are an analytics assistant for AgentOS.
The user asked a question. You ran a SQL query and got results.
Rules:
- Reply in the same language the user asked in — English, Urdu, or Roman Urdu.
- Write ONLY plain text. No markdown, no backticks, no pipe characters, no bullet points.
- If render_as is "table" or "bar_chart" or "line_chart": write one short sentence summarising the key finding (e.g. "Here are your 15 interactions from the past 4 days."). The UI will render the full data visually — do not repeat the data in text.
- If render_as is "text": answer in one or two sentences with the actual numbers.
- If the result is empty, say "No data found for that query."
- Never output a markdown table or code block.`;

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
    prompt: `User question: "${question}"\nrender_as: ${insight.render_as}\n\nSQL results: ${JSON.stringify(data)}`,
  });

  return NextResponse.json({ answer, sql: insight.sql, data, render_as: insight.render_as });
}
