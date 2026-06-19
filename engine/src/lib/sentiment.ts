import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

interface Analysis {
  sentiment: "Positive" | "Neutral" | "Negative" | "Hostile";
  intent_tag: "Pricing" | "Support" | "Troll" | "Lead" | "Spam" | "General";
}

export async function analyzeIntent(text: string): Promise<Analysis> {
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 64,
      system: `Classify the message.
Return JSON only: {"sentiment":"Positive|Neutral|Negative|Hostile","intent_tag":"Pricing|Support|Troll|Lead|Spam|General"}`,
      messages: [{ role: "user", content: text }],
    });
    const raw = (msg.content[0] as any).text;
    return JSON.parse(raw) as Analysis;
  } catch {
    return { sentiment: "Neutral", intent_tag: "General" };
  }
}
