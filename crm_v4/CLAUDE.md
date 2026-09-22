# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

CRM for **V4 Company MS&CO**. First feature: a WhatsApp chat panel over Evolution API, with login,
signup and admin approval. Read `.specify/memory/constitution.md` before writing code: MVC layering,
unit tests for every model/controller and Zod at every boundary are non-negotiable there.

## Commands

```bash
cp .env.example .env            # then fill EVOLUTION_API_KEY / EVOLUTION_WEBHOOK_TOKEN
docker compose up -d            # postgres:16 + evolution-api (host ports: POSTGRES_PORT / EVOLUTION_PORT)
npm install
npm run db:migrate -w backend   # apply Drizzle migrations
npm run dev                     # backend :3333 + frontend :3000 (concurrently)

npm test                        # all unit tests (Vitest, both workspaces); no Docker needed
npm test -w backend -- src/models/message.test.ts        # one backend file
npm test -w frontend -- src/components/chat/composer     # one frontend file (path filter)
npm run test:coverage           # backend fails below 80% lines in models/controllers
npm run lint && npm run typecheck

npm run db:generate -w backend  # new migration after editing backend/src/db/schema.ts
npm run db:seed:perf -w backend # 5,000 fake conversations (refuses non-local DATABASE_URL)
npm run db:seed:pipelines -w backend # up to 2,000 of those contacts as leads in the entry pipeline
npm run db:seed:bi -w backend   # large BI source + report for timing (refuses non-local DATABASE_URL)
docker compose --profile bi up -d mysql  # optional MySQL to test BI database sources
```

After `db:generate`, append `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for any new table to the
generated SQL (see `0000_init.sql`); every table must have RLS for Supabase.

## Architecture

npm workspaces: `backend/` (Fastify 5, ESM, TypeScript) and `frontend/` (Next.js 16 App Router).
The browser only talks to Next; `frontend/next.config.ts` rewrites `/api/*` to the backend, so the
session cookie and the SSE stream are same-origin. `compress: false` there keeps SSE unbuffered.

**Backend layering** (enforced by review, see constitution I):
- `routes/`: Zod-validated adapters only. `auth-guard.ts` provides `requireAuth` / `requireAdmin`
  and `currentUser(request)`.
- `controllers/`: use cases. Take an `AppContext` (`src/context.ts`: db, bus, evolution, storage,
  config, log) as first argument. Never import `db/`. `dto.ts` shapes all API responses (camelCase,
  matches `specs/001-whatsapp-chat-panel/contracts/openapi.yaml`).
- `models/`: plain functions taking `db` first; the only code that queries Postgres (Drizzle).
- `integrations/evolution/client.ts`: every Evolution response is parsed with a Zod schema from
  `response-schemas.ts`; failures become `DomainError('EVOLUTION_UNAVAILABLE', 502)`.
- `integrations/storage/`: `local` (dev, `MEDIA_DIR`) or `supabase` (prod) by `STORAGE_DRIVER`.
- Errors: throw `DomainError(code, message, status)` from `lib/errors.ts`; the handler in `app.ts`
  turns it into `{ code, message }`. User-facing messages are pt-BR.

**Realtime**: Evolution → `POST /api/webhooks/evolution?token=…` (constant-time token check, event
names normalized from `messages.upsert` to `MESSAGES_UPSERT`) → controllers → in-memory
`realtime/bus.ts` → `GET /api/events` (SSE; re-validates the session on each 25 s ping). Single
backend instance only; the bus would need Postgres LISTEN/NOTIFY to scale out.

**Messages**: `wa_message_id` is unique, so webhook re-deliveries are no-ops. Panel sends insert a
`pending` row, call Evolution, then `markSent` (which merges with a webhook row if it won the race).
Status only advances (`STATUS_RANK`); a DB check forbids status on inbound rows.

**Pipelines and leads** (feature 002, `specs/002-sales-pipelines/`): models `pipeline`, `stage`,
`lead`; controllers `pipelines` (structure, admin-only routes) and `leads` (board, move, CRUD). A lead
is one contact in one pipeline (unique `(pipeline_id, contact_id)`). Card order uses fractional
`position` (`POSITION_GAP`, midpoint on move, stage renumbered when gaps get too small); the server
computes it from `beforeLeadId`. Every stage change writes `lead_stage_changes` with stage names
copied, so history survives stage deletion. `messages.receive` calls `leads.enterFromWhatsApp` on a
conversation's first inbound message (the single `is_entry` pipeline, enforced by a partial unique
index). SSE: `lead.upserted { lead, previous }` (previous column/value so clients fix column totals
exactly), `lead.deleted`, `pipeline.changed` (clients refetch).

**BI reports** (feature 004, `specs/004-interactive-bi-reports/`): tables in `db/schema-bi.ts`
(re-exported by `schema.ts`). External sources (spreadsheet file/URL, Postgres, MySQL, HTTP API) are
read by `integrations/bi-connectors/` behind `network-guard.ts` (private IPs blocked unless
`BI_ALLOW_PRIVATE_NETWORKS=true`) and stored as snapshots in `bi_snapshot_rows` (jsonb); internal
sources (conversations, messages, leads) are read live. `models/bi/query-compiler.ts` is the only
code that turns a visual's definition into SQL. Source secrets are AES-GCM encrypted with
`BI_SECRETS_KEY`. `server.ts` runs `runDueRefreshes` every 60 s (single instance, in-flight guard).
Report saves use optimistic `version`; a 409 `REPORT_CONFLICT` carries `details` (who saved).
Frontend: `(painel)/relatorios` (editor, react-grid-layout) and `(painel)/fontes` (admin).

**Auth**: own implementation (argon2id, opaque session token in `v4_session` httpOnly cookie, only its
SHA-256 stored). First signup becomes active admin; later signups are `pending` until approved.

**Frontend**: `(auth)/` login and signup, `(painel)/` chat, funis, automacoes, relatorios, fontes, conexao, usuarios. Server state lives in
TanStack Query; `lib/use-events.ts` applies SSE events to the cache through helpers in
`lib/chat-cache.ts` (query keys `['conversations', filters]`, `['messages', id]`, `['connection']`)
and `lib/pipeline-cache.ts` (`['board', pipelineId, filter]` with `assignee` already resolved from
`me` to a user id, `['leads', 'contact', id]`, `['pipelines', …]`). Drag and drop uses dnd-kit
(pointer and touch sensors); keyboard moves are Alt + arrows handled by the cards themselves, plus a
"Mover" select on each card. Stage colors are a closed palette of AA-checked tokens
(`components/pipeline/stage-colors.ts`).
Brand tokens are in `src/app/globals.css` (`@theme`); `src/styles/contrast.test.ts` fails if a
token change breaks WCAG AA.

## Testing conventions

- Tests sit next to the code (`*.test.ts[x]`).
- Model tests use `createTestDb()` (`backend/src/test/db.ts`): PGlite in memory, cloned from a
  template migrated once per worker. No network, no Docker.
- Controller tests `vi.mock` the model modules and use `fakeContext()` (`backend/src/test/context.ts`).
- Route tests use `buildTestApp()` + `app.inject`; pass a real `createTestDb()` when data matters.
- Frontend: `renderWithClient` + `mockApi` (`frontend/src/test/render.tsx`); import
  `@/test/next-navigation` to mock the router; `FakeEventSource` for SSE.

## Spec Kit

Features follow `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
Each feature has its artifacts in `specs/NNN-name/` (001 chat panel, 002 pipelines and leads, …).
