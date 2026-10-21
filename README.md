# Agent Fight Club — Betrayal Protocol

An AI-agent social deduction arena. Five agents negotiate in public, make private offers, lock in one
secret action per round, and vote each other out. **Claude proposes every move. A deterministic,
fully tested engine decides what actually happens.**

- **Spectator mode**: watch five Claude agents compete, with an optional director's view of every secret.
- **Human mode**: take a seat against four agents. You see only what your seat is entitled to see.
- **Tournament Lab**: batch matches with rotating seats and reproducible seeds, then compare personalities
  with sample sizes and confidence intervals.
- **Replays**: rebuilt by the engine from the recorded inputs, with no model calls.

Full rules and definitions: [`docs/RULES.md`](docs/RULES.md).

---

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Framer Motion ·
Anthropic TypeScript SDK · Zod · Vitest · Supabase (optional) · Reticle (dev-only verification).

## Prerequisites

- Node.js 20+ (tested on 24) and npm
- Optional: an Anthropic API key (without one the app runs a clearly labelled **local demo mode**)
- Optional: a Supabase project for Postgres persistence (defaults to JSON files in `.data/`)

## Install and run

```bash
npm install
cp .env.example .env.local     # then add your key — .env.local is gitignored
npm run dev                    # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run dev:reticle` | Development server with Reticle verification instrumentation (opt-in; slower) |
| `npm run build` / `npm start` | Production build / serve (Node runtime) |
| `npm test` | 72 Vitest tests (engine, objectives, integration with mocked Claude, tournaments, storage) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run simulate -- 10 1` | 10 local demo matches from seed 1, printed to the terminal (no API calls) |
| `npx tsx scripts/live-check.mts` | One real decision per model to confirm your key and schemas (< $0.05) |

## Environment

All variables are **server-side only**. The API key is never sent to the browser, and system prompts
live in a server-only module (`src/agents/personalities.ts`). See [`.env.example`](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables live Claude agents. Empty means local demo mode. |
| `ANTHROPIC_MODEL_CHEAP` | `claude-haiku-4-5` | Routine decisions |
| `ANTHROPIC_MODEL_STRATEGIC` | `claude-opus-5-5` | Escalated, high-criticality decisions |
| `ANTHROPIC_STRATEGIC_EFFORT` | `low` | Effort for the strategic model |
| `ANTHROPIC_MAX_OUTPUT_TOKENS` | `700` | Output cap (cheap model) |
| `ANTHROPIC_MAX_OUTPUT_TOKENS_STRATEGIC` | `4000` | Output cap incl. adaptive thinking |
| `ANTHROPIC_MATCH_BUDGET_USD` | `0.75` | Per-match spend limit (estimated) |
| `ANTHROPIC_GLOBAL_BUDGET_USD` | `20` | Global kill switch (seeded from recorded usage on restart) |
| `ANTHROPIC_ESCALATION_THRESHOLD` | `3` | Criticality points needed to escalate |
| `ANTHROPIC_REQUEST_TIMEOUT_MS` / `ANTHROPIC_MAX_RETRIES` | `45000` / `2` | Timeouts, bounded retries |
| `ANTHROPIC_GLOBAL_CONCURRENCY` / `ANTHROPIC_MATCH_CONCURRENCY` | `6` / `5` | Concurrency limits |
| `ANTHROPIC_REQUESTS_PER_MINUTE` | `40` | Global request rate cap |
| `ANTHROPIC_PRICING_JSON` | — | Override the pricing table (USD per MTok) |
| `AGENT_MODE` | `auto` | `demo` forces heuristic agents even with a key |
| `TOURNAMENT_CONCURRENCY` / `TOURNAMENT_MAX_LIVE_MATCHES` | `2` / `10` | Tournament worker limits (demo allows 100) |
| `HUMAN_TURN_TIMEOUT_MS` | `180000` | Human turn timer per phase |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | — | Switch storage to Postgres (server only) |

## How to play

- **Spectator match**: Home → *Spectate* → choose ruleset, seed and speed → *Start match*.
  Pause, resume, change speed or cancel from the scorebug.
- **Human match**: Home → *Play as human* → *Take your seat*. Send public messages or private
  offers (escrowed credits plus an optional pact), answer offers, lock one action, and vote. Your
  participant credential is an httpOnly cookie, and every action is validated on the server.
- **Tournament**: *Tournament Lab* → pick the match count, seed start and ruleset → *Run*. Drill into
  any match or replay it.

## Architecture

```
src/game/      Pure deterministic engine (no React, no SDK, no DB)
  types, config, random (seeded mulberry32), objectives, clues, legal-actions,
  resolve-round, scoring, engine (phase machine), replay, visibility (server-side filtering)
src/agents/    Personalities (public + server-only prompts), memory (facts vs beliefs),
               Zod schemas, prompts, ClaudeBrain, HeuristicBrain (labelled demo/fallback)
src/llm/       env, pricing, usage, limits (semaphores, rate window, budget kill switch),
               router (cheap vs strategic), gateway (timeouts, retries + jitter, usage records)
src/server/    MatchSession (orchestration), controller (single advancing loop per match),
               store (file / Supabase), tournaments + statistics, API schemas
src/app/       Pages + API routes;  src/components/  UI
supabase/migrations/0001_init.sql   Tables, indexes, RLS
```

**Trust boundary.** The model only proposes an action. Each proposal is schema-validated (a discriminated
union), checked for legality against the agent's view, retried once with a compact error, and otherwise
replaced by a recorded deterministic fallback. The engine then validates it again against authoritative
state. Claude never mutates state, decides winners or awards points.

**Orchestration.** One background loop per match is the only code path that advances phases, so each round
resolves exactly once. Human inputs are synchronous engine applications. The append-only input log is the
source of truth: any match can be rebuilt by replay, and an interrupted match resumes when it is next opened.

## Database (optional)

1. Create a Supabase project and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   (SQL editor or `supabase db push`).
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and restart.

RLS is enabled on every table with no anon policies. The browser never talks to Postgres directly, and
all reads go through the per-viewer filtered API. Secret objectives live in `player_private_state`, apart
from public match data. Unique keys on `(match_id, seq)` and `(match_id, round, player_id)` prevent
duplicate events and commits, and match rows use optimistic version checks.

## API credit

Measured with the defaults: a **Blitz match costs ≈ $0.20** (≈ 46 calls). A Standard match is
≈ $0.30–0.60. Every request records the model, input, output and cache tokens, duration, outcome and an
estimated cost from the pricing table. Budgets are checked **before** each call. When the global limit
is reached, the kill switch stops all calls and the labelled demo agents finish any running match.
Tournaments never start automatically and are capped at 10 matches in live mode.

## Verification with Reticle (development)

The app is instrumented for [Reticle](https://docs.reticle.sh). The bridge is **opt-in**, because it stamps every
JSX element and hooks the runtime, and it is never in production builds. Start the instrumented dev server with
`npm run dev:reticle`, then:

```bash
npx @reticlehq/server serve     # local daemon on :4400 (no account needed for local use)
npx @reticlehq/server status    # confirms the page is connected
```

The arena publishes the `arena` state and the `arena:phase`, `arena:complete`, `human:action` and
`human:rejected` signals, so checks can assert on app state and not only on the DOM.

## Known limitations

- The match loop runs inside the Node.js server process. Deploy on a long-running Node host
  (`npm start`, a container, Railway/Render/Fly). Serverless platforms that freeze idle functions will
  stall running matches. Matches resume when reopened.
- The Supabase store is implemented and typed but has not been exercised against a live project.
- Human mode is single-player (one human seat). The persistence layer is designed for multiplayer, but auth isn't built.
- Prompt caching is enabled on the stable system prefix, but the prefix is below the minimum
  cacheable length for most models, so cache hits are rare (the recorded usage shows this honestly).
- Demo (heuristic) agents use short template lines. They exist for zero-cost testing, and are labelled as such.
- Model behaviour varies between runs. Determinism is guaranteed for the engine given the same
  setup and recorded inputs, which is what replays use.
