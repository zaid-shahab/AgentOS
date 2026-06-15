import "dotenv/config";
import express from "express";
import cors from "cors";
import webhookRouter from "./routes/webhook";

const app = express();
app.use(cors());
// Raw body needed for Meta webhook signature verification
app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/webhook", webhookRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Engine running on :${PORT}`));
