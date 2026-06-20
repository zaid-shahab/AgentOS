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
  if (APP_SECRET && !verifySignature(req)) return res.sendStatus(401);

  // Acknowledge immediately — Meta expects <5s
  res.sendStatus(200);

  const body = JSON.parse((req.body as Buffer).toString());
  console.log("[webhook] raw payload:", JSON.stringify(body, null, 2));
  if (body.object !== "instagram" && body.object !== "page") return;

  for (const entry of body.entry ?? []) {
    // Messaging array → DMs
    for (const event of entry.messaging ?? []) {
      await processEvent(event, "demo", body.object, null).catch((e) =>
        console.error("[webhook] processEvent failed (messaging):", e?.message ?? e)
      );
    }
    // Changes array → comments, posts
    for (const change of entry.changes ?? []) {
      await processEvent(change, "demo", body.object, change.field).catch((e) =>
        console.error("[webhook] processEvent failed (changes):", e?.message ?? e)
      );
    }
  }
});

async function processEvent(
  event: any,
  accountId: string,
  object: string,     // "instagram" | "page"
  field: string | null  // "comments" | "feed" | null (for messaging events)
) {
  let text: string | null = null;
  let senderId = "unknown";
  let commentId: string | undefined;
  let platform: string;

  if (event.message?.text) {
    // Skip echo events (bot's own outgoing messages reflected back by Meta)
    if (event.message.is_echo) return;

    // Messaging array: Instagram DM or Messenger DM
    text = event.message.text;
    senderId = event.sender?.id ?? "unknown";
    platform = object === "instagram" ? "instagram_dm" : "messenger_dm";

  } else if (field === "comments" && event.value?.text) {
    // Instagram comment — value.id is the comment ID, value.from.id is the author
    text = event.value.text;
    senderId = event.value?.from?.id ?? "unknown";
    commentId = event.value?.id;
    platform = "instagram_comment";

  } else if (field === "feed" && event.value?.message) {
    // Facebook Page feed — item="comment" has a comment_id, item=post has post_id
    const item = event.value?.item as string | undefined;
    text = event.value.message;
    senderId = event.value?.from?.id ?? "unknown";
    commentId = item === "comment" ? (event.value?.comment_id ?? event.value?.id) : undefined;
    platform = item === "comment" ? "facebook_comment" : "facebook_post";

  } else {
    // Unrecognised event shape — skip
    return;
  }

  if (!text) return;

  console.log(`[webhook] event received — platform:${platform} sender:${senderId} text:"${text}"`);

  // 1. Analyse sentiment + intent
  const { sentiment, intent_tag } = await analyzeIntent(text);
  console.log(`[sentiment] intent:${intent_tag} sentiment:${sentiment}`);

  // 2. Load active config for this account
  const { data } = await supabase
    .from("automation_configs")
    .select("config")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data?.config) console.log(`[executor] no config found for account:${accountId}`);

  // 3. Execute
  const action_taken = data?.config
    ? await executeConfig(data.config, { text, senderId, commentId, platform, sentiment, intent_tag, accountId })
    : "no_config";

  console.log(`[executor] action_taken:${action_taken}`);

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
  console.log("[db] interaction logged");
}

export default router;
