# AgentOS — Generative AI Orchestrator

> Voice-to-deployment generative engine that spins up custom AI agents for Meta platforms.

## Architecture

```
AgentOS/
├── web/                    # Next.js frontend (Command Center)
│   ├── app/
│   │   ├── page.tsx        # Main UI — Architect / Insights / Knowledge / Crons tabs
│   │   └── api/
│   │       ├── build/      # POST /api/build — prompt → LLM → nodes+edges
│   │       ├── insights/   # POST /api/insights — question → Text-to-SQL → answer
│   │       ├── cron/       # POST/GET/DELETE /api/cron — schedule management
│   │       └── knowledge/  # POST /api/knowledge — text → embeddings → pgvector
│   ├── components/
│   │   ├── NodeCanvas.tsx  # Custom pan/drag canvas, SVG bezier edges
│   │   └── AgentNode.tsx   # Individual node card with stagger animation
│   └── lib/
│       ├── schema.ts       # Zod schemas (AutomationConfig, GraphNode, etc.)
│       ├── configToGraph.ts # AutomationConfig → { nodes, edges }
│       └── supabase.ts
│
├── engine/                 # Express webhook server
│   └── src/
│       ├── index.ts        # Express app (port 4000)
│       ├── routes/webhook.ts  # Meta webhook verify + event handler
│       ├── lib/
│       │   ├── sentiment.ts   # Claude Haiku intent/sentiment classifier
│       │   ├── executor.ts    # JSON state machine executor → Meta API calls
│       │   └── supabase.ts
│       └── worker.ts       # BullMQ worker — runs scheduled reports
│
└── supabase/
    └── migrations/001_init.sql  # All tables + pgvector + run_readonly_query fn
```

## Quick Start

### 1. Install
```bash
npm install
```

### 2. Set up Supabase
1. Create project at [supabase.com](https://supabase.com)
2. Run `supabase/migrations/001_init.sql` in the SQL editor
3. Copy your project URL + keys

### 3. Configure environment
```bash
cp web/.env.local.example web/.env.local
cp engine/.env.example engine/.env
# Fill in your API keys
```

### 4. Start Redis
```bash
docker run -d -p 6379:6379 redis:alpine
```

### 5. Run
```bash
npm run dev                  # web on :3000 + engine on :4000
cd engine && npm run worker  # report worker (separate terminal)
```

### 6. Expose engine for Meta webhooks
```bash
npx localtunnel --port 4000 --subdomain agentos-engine
# Set https://agentos-engine.loca.lt/webhook/meta as Meta callback URL
# META_VERIFY_TOKEN must match what you set in Meta Developer Console
```

## Team Division

| Dev | Owns |
|-----|------|
| Dev 1 — Infrastructure | `engine/` plumbing, Supabase migrations, Redis/BullMQ, Meta webhook verification |
| Dev 2 — LLM Brain | `web/lib/schema.ts` tuning, prompt engineering in `api/build` + `api/insights`, `lib/sentiment.ts` |
| Dev 3 — Frontend | `web/components/`, `web/app/page.tsx`, CSS polish, voice input |

## Demo Script (5 min)

1. **Build** — speak "Watch IG comments. If someone asks for price, DM them. Hide toxic comments."
   → Node graph assembles itself in real time.
2. **Test** — DM the test IG account live on screen.
3. **Interrogate** — type "How many leads today?" → instant answer.
4. **Schedule** — say "Email me a daily briefing at 9 AM" → cron badge appears.
