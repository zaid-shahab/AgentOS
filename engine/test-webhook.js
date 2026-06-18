// Run: node test-webhook.js
// Sends a fake Instagram DM event to the local engine with correct HMAC signature

const crypto = require("crypto");
const http = require("http");

require("dotenv").config({ path: __dirname + "/.env" });

const APP_SECRET = process.env.META_APP_SECRET;
if (!APP_SECRET) { console.error("META_APP_SECRET not set in engine/.env"); process.exit(1); }

const payload = JSON.stringify({
  object: "instagram",
  entry: [{
    id: "demo",
    messaging: [{
      sender:    { id: "test-user-123" },
      recipient: { id: "demo" },
      timestamp: Date.now(),
      message:   { mid: "mid.test", text: "What is the price of a hoodie?" }
    }]
  }]
});

const sig = "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(payload).digest("hex");

const options = {
  hostname: "localhost",
  port: 4000,
  path: "/webhook/meta",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "x-hub-signature-256": sig,
  },
};

const req = http.request(options, (res) => {
  console.log(`Response: ${res.statusCode}`);
  if (res.statusCode === 200) {
    console.log("✓ Event accepted — check engine terminal for logs");
  } else {
    console.log("✗ Event rejected — check signature or engine logs");
  }
});

req.on("error", (e) => console.error("Error:", e.message));
req.write(payload);
req.end();
