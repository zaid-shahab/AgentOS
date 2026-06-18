import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

// The editable surface of a single graph node.
const NodePatchSchema = z.object({
  type: z.enum(["trigger", "decision", "action", "schedule"]),
  icon: z.enum([
    "instagram", "messenger", "branch", "message", "userplus", "shield",
    "tag", "search", "bell", "mail", "clock", "bot", "sparkles", "zap",
  ]),
  title: z.string().max(40),
  subtitle: z.string().max(80),
  meta: z.string().max(24),
});

const SYSTEM_PROMPT = `You edit a SINGLE node inside an AgentOS automation flow for Meta platforms (Instagram / Messenger).
You are given the node's current fields and an instruction describing how its behaviour should change.
Return the updated node fields only — do not invent other nodes.

Field rules:
- type: trigger (an event source) | decision (an AI/branch classifier) | action (a thing the agent does) | schedule (a cron/time trigger)
- icon: pick the most fitting from: instagram, messenger, branch, message, userplus, shield, tag, search, bell, mail, clock, bot, sparkles, zap
  - send DM/reply -> message ; capture/tag lead -> userplus or tag ; hide/block/moderate -> shield
  - email -> mail ; alert/notify -> bell ; knowledge/RAG lookup -> search ; classify/branch -> branch
  - instagram trigger -> instagram ; messenger trigger -> messenger ; schedule -> clock
- meta: a short UPPERCASE label, e.g. TRIGGER, DECISION, ACTION, SCHEDULE (decisions may read like "CLAUDE · DECISION")
- title: <= 40 chars, human-readable name of what the node does now
- subtitle: <= 80 chars, concise description of the node's behaviour
Keep anything the instruction does not change.`;

export async function POST(req: NextRequest) {
  try {
    const { node, instruction } = await req.json();
    if (!node || !instruction) {
      return NextResponse.json({ error: "node and instruction are required" }, { status: 400 });
    }

    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: NodePatchSchema,
      system: SYSTEM_PROMPT,
      prompt: `Current node:
type: ${node.type}
icon: ${node.icon}
meta: ${node.meta}
title: ${node.title}
subtitle: ${node.subtitle}

Instruction: ${instruction}`,
    });

    return NextResponse.json({ patch: object });
  } catch {
    return NextResponse.json(
      { error: "Couldn't apply that change. Try rephrasing what this node should do." },
      { status: 422 }
    );
  }
}
