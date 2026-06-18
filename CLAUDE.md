# AgentOS — Claude Code Instructions

## What this project is
A generative AI orchestrator for Meta platforms (Instagram + Messenger). Users describe an agent in plain English or voice, and the platform compiles it into a live JSON state machine, visualises it as a node graph, and deploys it to a Meta webhook. It also has a conversational Insight Engine (Text-to-SQL) and scheduled reports via BullMQ/Redis.

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

## Database setup
Run migrations in order in the Supabase SQL Editor:
1. `supabase/migrations/001_init.sql` — creates all tables, pgvector index, `run_readonly_query` function
2. `supabase/migrations/002_seed_demo_data.sql` — seeds 15 fake interactions + 3 leads for testing Insights tab (dev/demo only)

Tables: `automation_configs`, `interactions`, `leads`, `knowledge_base`, `notifications`

## Prompt tuning status (Dev 2)
- `web/app/api/build/route.ts` SYSTEM_PROMPT tuned and tested ✅
- Unconditional actions correctly skip Decision node
- Multi-condition prompts produce correct fan-out graphs
- intent_tag vocab: Pricing, Troll, Support, Lead, Spam, Hostile, Angry, Shipping, General

## Key files — read these first
| File | What it does |
|------|-------------|
| `web/lib/schema.ts` | Zod schemas — single source of truth for all types. Change here first. |
| `web/lib/configToGraph.ts` | Converts `AutomationConfig` JSON → `{ nodes, edges }` for the canvas |
| `web/app/api/build/route.ts` | Core LLM pipeline: prompt → `generateObject()` → graph |
| `web/app/api/insights/route.ts` | Text-to-SQL: question → Claude Haiku → SQL → Supabase |
| `web/app/api/cron/route.ts` | Natural language → cron expression → BullMQ repeatable job |
| `web/components/NodeCanvas.tsx` | Custom pan/drag canvas — DO NOT replace with React Flow for hackathon |
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
1. Architect tab → type/speak: "Watch IG comments. If someone asks for price, DM them. Hide toxic comments." → click Build → nodes animate onto canvas
2. DM the test Instagram account live → bot replies in real time
3. Insights tab → type: "How many leads today?" → instant answer
4. Insights tab → type: "Send me a summary every morning at 9 AM" → cron badge appears
