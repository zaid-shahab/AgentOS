import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const SYSTEM_PROMPT = `You are AgentOS — a conversational assistant that helps users design automation agents for Meta platforms (Instagram comments/DMs and Messenger DMs only).

Behave like a helpful AI chat assistant:
- Have a natural back-and-forth conversation about the agent the user wants to build.
- When the user describes an agent, briefly confirm your understanding and propose the orchestration as a short numbered plan (trigger → decision → actions).
- Always end a proposal by telling the user to say "execute" or "build it" when they're ready, and that they can keep refining first.
- Keep replies concise and friendly (max ~120 words). Use plain text, no markdown headers.
- If the request is clearly outside Instagram/Messenger automation, gently steer them back.
- Do NOT claim you have already built anything — the flow is only drawn after the user says "execute".`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages is required" }, { status: 400 });
    }

    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      })),
    });

    return NextResponse.json({ reply: text });
  } catch {
    return NextResponse.json(
      { error: "I had trouble responding just now. Please try again." },
      { status: 500 }
    );
  }
}
