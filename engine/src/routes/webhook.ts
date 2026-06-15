import { Router, Request, Response } from "express";
import crypto from "crypto";
import { analyzeIntent } from "../lib/sentiment";
import { executeConfig } from "../lib/executor";
import { supabase } from "../lib/supabase";

const router = Router();
const APP_SECRET = process.env.META_APP_SECRET!;

function verifySignature(req: Request): boolean {
  const sig = req.headers["x-hub-signature-256"] as string;
  if (!sig) return false;
  const hmac = crypto.createHmac("sha256", APP_SECRET);
  hmac.update(req.body as Buffer);
  const expected = `sha256=${hmac.digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ── Webhook verification (GET) ────────────────────────────────────────────────
router.get("/meta", (req: Request, res: Response) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    console.log("Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ── Webhook event handler (POST) ──────────────────────────────────────────────
router.post("/meta", async (req: Request, res: Response) => {
  if (!verifySignature(req)) return res.sendStatus(401);

  // Acknowledge immediately — Meta expects <5s
  res.sendStatus(200);

  const body = JSON.parse((req.body as Buffer).toString());
  if (body.object !== "instagram" && body.object !== "page") return;

  for (const entry of body.entry ?? []) {
    for (const event of [...(entry.messaging ?? []), ...(entry.changes ?? [])]) {
      await processEvent(event, entry.id);
    }
  }
});

async function processEvent(event: any, accountId: string) {
  // Normalise event shape
  const isComment = !!event.value?.text;
  const isDM      = !!event.message?.text;
  const text      = isComment ? event.value.text : isDM ? event.message.text : null;
  const senderId  = event.sender?.id ?? event.value?.from?.id ?? "unknown";
  const platform  = isComment ? "instagram_comment" : "instagram_dm";

  if (!text) return;

  // 1. Analyse sentiment + intent
  const { sentiment, intent_tag } = await analyzeIntent(text);

  // 2. Load active config for this account
  const { data } = await supabase
    .from("automation_configs")
    .select("config")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // 3. Execute
  const action_taken = data?.config
    ? await executeConfig(data.config, { text, senderId, platform, sentiment, intent_tag, accountId })
    : "no_config";

  // 4. Log to Data Lake
  await supabase.from("interactions").insert({
    account_id: accountId,
    platform,
    sender_id:  senderId,
    message:    text,
    sentiment,
    intent_tag,
    action_taken,
  });
}

export default router;
