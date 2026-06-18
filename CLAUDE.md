# AgentOS — Claude Code Instructions

## What this project is
A generative AI orchestrator for Meta platforms (Instagram + Messenger). Users describe an agent in plain English or voice, and the platform compiles it into a live JSON state machine, visualises it as a node graph, and deploys it to a Meta webhook. It also has a conversational Insight Engine (Text-to-SQL) and scheduled reports via BullMQ/Redis.

The Command Center UI uses the **AgentOS dark "omniforge" design system** (Space Grotesk / Manrope / JetBrains Mono, glass panels, neon node accents, dot-matrix canvas). The shell is a 68px icon rail + main column + 376px right panel. Tabs: **Home** (marketing landing), **Orchestrator** (chat → build → canvas), **Database / Insights**, **Knowledge Base**, **Scheduled Reports**.

## Monorepo structure
```
AgentOS/
├── web/          Next.js 15 frontend — Command Center UI + API routes
├── engine/       Express webhook server — Meta events + execution engine
└── supabase/     SQL migrations
```

## Stack
- **Frontend:** Next.js 15 (App Router), React 19, TypeScript
- **AI:** Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`), Claude Sonnet 4.6 for build, Claude Haiku for sentiment/insights/cron
- **Database:** Supabase (Postgres + pgvector)
- **Queue:** Redis + BullMQ
- **Meta:** Meta Graph API v21.0 (Instagram + Messenger webhooks)

## Running locally
```bash
# Prerequisites: Node 18+, Docker Desktop running
docker run -d -p 6379:6379 --name agentos-redis redis:alpine
npm install
npm run dev                  # web :3000 + engine :4000
cd engine && npm run worker  # report worker (separate terminal, only needed for cron)
```

## Environment files
- `web/.env.local` — copy from `web/.env.local.example`
- `engine/.env` — copy from `engine/.env.example`

Required keys before running:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY` (embeddings only)
- `REDIS_URL=redis://localhost:6379`

Meta keys (`META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_PAGE_ACCESS_TOKEN`) are only needed for webhook testing — app runs fine without them.

## Webhook tunnel (local development)
Use localtunnel with a fixed subdomain to expose the engine to Meta:
```bash
npx localtunnel --port 4000 --subdomain agentos-eocean-bilal-pk
```
Webhook URL to register in Meta dashboard: `https://agentos-eocean-bilal-pk.loca.lt/webhook/meta`
Register once under Meta App → Instagram (or Messenger) → Settings → Webhooks → Add Callback URL.

## Testing the webhook locally
A signed fake-event test script is at `engine/test-webhook.js`:
```bash
cd engine && node test-webhook.js
```
Sends a properly HMAC-signed fake Instagram DM to `localhost:4000`. Expected terminal output:
```
[webhook] event received — platform:instagram_dm sender:test-user-123 text:"..."
[sentiment] intent:Pricing sentiment:Positive
[executor] action_taken:send_dm   ← or no_config if no flow deployed yet
[db] interaction logged
```

## accountId is hardcoded "demo" everywhere
`engine/src/routes/webhook.ts` passes `"demo"` as accountId for all incoming Meta events (not `entry.id`). This matches the hardcoded `accountId = "demo"` used by all web API routes. Do not change this for the hackathon.

## Database setup
Run migrations in order in the Supabase SQL Editor:
1. `supabase/migrations/001_init.sql` — creates all tables, pgvector index, `run_readonly_query` function
2. `supabase/migrations/002_seed_demo_data.sql` — seeds 15 fake interactions + 3 leads for testing Insights tab (dev/demo only)
3. `supabase/migrations/003_cron_jobs.sql` — creates `cron_jobs` table for persistent scheduled report storage
4. `supabase/migrations/004_kb_source.sql` — adds `source` column to `knowledge_base` (tracks filename for uploaded docs)

Tables: `automation_configs`, `interactions`, `leads`, `knowledge_base`, `notifications`, `cron_jobs`

## Prompt tuning status (Dev 2) — all complete ✅
- `web/app/api/build/route.ts` — SYSTEM_PROMPT tuned and tested
  - Unconditional actions correctly skip Decision node (Trigger → Action directly)
  - Multi-condition prompts produce correct fan-out graphs
  - Pre-flight classifier (Claude Haiku) rejects non-Meta prompts before hitting generateObject
  - intent_tag vocab: Pricing, Troll, Support, Lead, Spam, Hostile, Angry, Shipping, General
- `web/app/api/insights/route.ts` — two-step pipeline: SQL generation → result interpretation
  - Returns plain-English answer from actual query results (not just SQL explanation)
  - `render_as` field: "text" | "table" | "bar_chart" | "line_chart" — set by LLM based on user intent
  - CSV export button appears on every assistant message that has data rows
  - All prompts use AgentOS branding (not OmniForge)
- `web/components/InsightRenderer.tsx` — renders table, bar chart, or line chart based on `render_as`
  - Table: HTML table with truncated cells
  - Bar chart: Recharts BarChart, orange bars, dark theme
  - Line chart: Recharts LineChart, cyan line, dark theme
  - Auto-detects x-axis (first string column) and y-axis (first numeric column)
- `web/app/api/cron/route.ts` — cron jobs persisted to Supabase `cron_jobs` table
  - Scheduled Reports tab reads from Supabase (not Redis) so survives Docker restarts
  - DELETE removes from both BullMQ and Supabase
- `web/app/api/knowledge/route.ts` — saves text to `knowledge_base` table (two modes)
  - **File upload mode**: multipart/form-data with `file` field — parses PDF (`pdf-parse`), DOCX (`mammoth`), TXT/MD/CSV
  - **Text paste mode**: JSON `{ text }` — existing plain text chunking
  - No OpenAI dependency — plain text storage, executor retrieves with simple SELECT
  - Stores `source` (filename) alongside each chunk
  - DELETE endpoint to remove individual chunks by id
  - Success/error feedback shown in UI after save or upload

## UI design system & interaction model (post-redesign)
- **Design tokens & all `.of-*` / `.lp-*` styles** live in `web/app/globals.css` (ported from the omniforge prototype). Node accents are CSS vars: trigger=cyan, decision=purple, action=orange, schedule=green.
- `web/components/Icon.tsx` — Lucide-style stroked-SVG icon set (`<Icon name="…" />`). All node/UI icons resolve here; unknown names fall back to `zap`. Add new glyphs here.
- `web/components/Landing.tsx` — Home tab. Marketing landing: hero with CTAs, "How it works" 4-step cards with built-in animated visuals, capability grid, closing CTA. CTAs call `onNav(tab)` to deep-link into modules.
- **Orchestrator is conversational, not one-shot.** `web/app/page.tsx` holds `orchMode: "chat" | "canvas"` and a persistent `orchMsgs` history.
  - Chat mode: user describes the agent; AgentOS replies via `web/app/api/chat/route.ts` (Claude Haiku conversational). Nothing is drawn yet.
  - Saying "execute / build it / deploy it …" (`buildIntent()`) or clicking "Build the flow" sends the **accumulated description** to `/api/build`, draws nodes, and flips to canvas mode.
  - Chat ↔ canvas toggle ("Chat" / "View flow") never clears history.
- **Single-node editing (canvas mode).** Click a node → right panel becomes an inspector.
  - "Describe the change" box (text or voice) → `web/app/api/edit-node/route.ts` (Claude Haiku, `generateObject`) regenerates just that node's `type/icon/title/subtitle/meta`. Rest of the flow is untouched.
  - Manual field controls (type swatches, title, subtitle, meta, icon) live-edit the node; **Delete node** also drops connected edges.
- **Voice = push-to-talk.** `handleVoice(target)` in `page.tsx` uses Web Speech API with `continuous + interimResults`; click mic to start, click again to stop. It does NOT auto-submit — the user reviews then hits Send. Targets: `architect` | `insights` | `node`.

## Key files — read these first
| File | What it does |
|------|-------------|
| `web/lib/schema.ts` | Zod schemas — single source of truth for all types. Change here first. |
| `web/lib/configToGraph.ts` | Converts `AutomationConfig` JSON → `{ nodes, edges }` (NODE_W=218, NODE_H=124) |
| `web/app/api/build/route.ts` | Core LLM pipeline: prompt → `generateObject()` → graph |
| `web/app/api/chat/route.ts` | Conversational orchestrator replies (Claude Haiku) — no graph drawn |
| `web/app/api/edit-node/route.ts` | Regenerate a single node from a plain-language instruction (Claude Haiku) |
| `web/app/api/insights/route.ts` | Text-to-SQL: question → Claude Haiku → SQL → Supabase |
| `web/app/api/cron/route.ts` | Natural language → cron expression → BullMQ repeatable job |
| `web/app/page.tsx` | Command Center: sidebar rail, all tabs, orchestrator chat/canvas state, node inspector |
| `web/components/NodeCanvas.tsx` | Custom pan/drag/auto-fit canvas, animated bezier edges — DO NOT replace with React Flow |
| `web/components/AgentNode.tsx` | Single node card; clickable for selection/editing |
| `web/components/Icon.tsx` | Lucide-style SVG icon set used across the UI |
| `web/components/Landing.tsx` | Home / marketing landing page |
| `web/components/InsightRenderer.tsx` | Renders insight results as table / bar / line chart |
| `engine/src/routes/webhook.ts` | Meta webhook verifier + event dispatcher |
| `engine/src/lib/executor.ts` | JSON state machine runner → Meta API actions |
| `engine/src/lib/sentiment.ts` | Claude Haiku intent/sentiment classifier |
| `engine/src/worker.ts` | BullMQ worker — fires scheduled reports |

## Scope lock — do not add these
- No CRM inbox UI (human reply interface)
- No WhatsApp, Twitter, LinkedIn — Instagram + Messenger only
- No complex auth — `accountId = "demo"` hardcoded is fine for hackathon
- No React Flow migration — the custom NodeCanvas is intentional

## Team ownership
| Dev | Files |
|-----|-------|
| Dev 1 — Infrastructure | `engine/` plumbing, Supabase tables, Redis/BullMQ, Meta webhook verification |
| Dev 2 — LLM Brain | `web/lib/schema.ts`, `web/app/api/build/`, `web/app/api/insights/`, `engine/src/lib/sentiment.ts` prompt tuning |
| Dev 3 — Frontend | `web/components/`, `web/app/page.tsx`, `web/app/globals.css`, voice input |

## Node shape (what the canvas expects)
```typescript
interface GraphNode {
  id: string;        // "n_trigger", "n_eval_xxx", "n_action_xxx"
  type: "trigger" | "decision" | "action" | "schedule";
  icon: string;      // "instagram", "branch", "message", "shield", "tag" etc.
  title: string;
  subtitle: string;
  meta: string;      // "TRIGGER", "GPT-4o · DECISION", "ACTION"
  x: number;        // pixel position — calculated by configToGraph()
  y: number;
}
```
Node accent colours are CSS-driven: trigger=cyan, decision=purple, action=orange, schedule=green.

## Adding a new action type
1. Add the value to `ActionSchema` in `web/lib/schema.ts`
2. Add a case in `executeConfig()` in `engine/src/lib/executor.ts`
3. Add icon + label mappings in `web/lib/configToGraph.ts`

## Meta webhook flow
```
Meta event → POST /webhook/meta (engine :4000)
  → verifySignature()
  → analyzeIntent() via Claude Haiku
  → load AutomationConfig from Supabase
  → executeConfig() → Meta Graph API call
  → log to interactions table
```

## Demo script (rehearse this)
1. Home tab → product landing; click "Build an agent" → Orchestrator
2. Orchestrator (chat) → type/speak: "Watch IG comments. If someone asks for price, DM them. Hide toxic comments." → AgentOS replies conversationally → say "execute" → nodes animate onto canvas
3. Click a node → "Describe the change": e.g. "send an email instead of a DM" → node regenerates in place. Toggle back to Chat — history is preserved.
4. Click **Deploy** → config saved to Supabase under `account_id = "demo"`
5. DM the test Instagram account live → bot replies in real time
6. Knowledge Base tab → upload `brand-faq.txt` (or any PDF/DOCX) → chunks stored in Supabase → bot references it when answering DMs with `rag_query` action
7. Insights tab → type: "How many leads today?" → instant answer
8. Insights tab → type: "Send me a summary every morning at 9 AM" → cron badge appears
