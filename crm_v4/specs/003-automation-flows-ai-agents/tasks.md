---

description: "Task list for Fluxos de Automação e Agentes de IA"
---

# Tasks: Fluxos de Automação e Agentes de IA

**Input**: Design documents from `specs/003-automation-flows-ai-agents/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED. The constitution (Princípio III) makes unit tests non-negotiable: every model and
controller gets a `*.test.ts` next to it; components with logic get Testing Library tests. Within each
story, write the test task first and confirm it fails before implementing.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md). Shared pieces used by
several stories (schema, migration, run/flow models, the hand-off use case, the automated-send path)
live in Foundational and carry no story label. US2 builds on the US1 engine; US3–US5 build on US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 from spec.md
- Paths: `backend/src/`, `frontend/src/` (web app per plan.md). Tests live next to the code.

## Conventions for every task

- Backend layering (constitution I): `routes/` validate with Zod → call `controllers/` → map result.
  `controllers/` (including `controllers/automation/**`) never import `db/`; `models/` never import
  Fastify, Next.js or HTTP types. Controllers take `AppContext` first.
- Model tests use `createTestDb()` (`backend/src/test/db.ts`). Controller tests `vi.mock` the model
  modules and use `fakeContext()` (`backend/src/test/context.ts`). Route tests use `buildTestApp()` +
  `app.inject`. Frontend tests use `renderWithClient` + `mockApi` (`frontend/src/test/render.tsx`).
- JSON names are camelCase exactly as in `contracts/openapi.yaml`; graph shape exactly as in
  `contracts/flow-graph.md`; SSE payloads as in `contracts/sse-events.md`.
- Errors: `DomainError(code, message, status)` from `backend/src/lib/errors.ts`; messages in pt-BR.
- Named constants, not magic numbers: `MAX_STEPS = 100`, `AGENT_DEBOUNCE_MS = 4_000`,
  `PROVIDER_TIMEOUT_MS = 30_000`, `WORKER_TICK_MS = 5_000`, `RUN_LEASE_MS = 60_000`,
  `RUN_RETENTION_DAYS = 90`, `STEP_PAYLOAD_MAX_BYTES = 8 * 1024`.
- Every automated send goes through the shared send path from T016; never call
  `ctx.evolution.sendText` directly from automation code.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New dependency, env var and test environment for React Flow

- [X] T001 Add `@xyflow/react` (^12) to `frontend/package.json` dependencies (`npm install -w frontend @xyflow/react`) and `@anthropic-ai/sdk` to `backend/package.json` (research §5) and import `@xyflow/react/dist/style.css` once in `frontend/src/app/(painel)/layout.tsx`
- [ ] T002 [P] Add `AI_CREDENTIALS_KEY` to `.env.example` (comment: `openssl rand -base64 32`) and to the Zod env schema in `backend/src/config.ts` as a required string that must base64-decode to exactly 32 bytes (issue message "precisa ser 32 bytes em base64"); cover valid/short/missing in `backend/src/config.test.ts` (create if absent)
- [ ] T003 [P] Add `ResizeObserver` and `DOMMatrixReadOnly` stubs to `frontend/src/test/setup.ts` so React Flow renders under jsdom

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, shared models, DTOs, realtime event, graph schema, the hand-off use case and the automated-send path. Every user story depends on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Schema and migration

- [ ] T004 Extend `backend/src/db/schema.ts` exactly per data-model.md: enums `ai_vendor (openai, anthropic, gemini)`, `ai_test_status (ok, failed)`, `flow_status (draft, active, inactive)`, `flow_trigger_type (message_received, manual)`, `run_status (running, waiting, completed, failed, cancelled)`, `run_origin (message_received, manual, test)`, `step_status (ok, failed)`, `handling_mode (automation, human)`; tables `ai_providers` (`name text unique`, `vendor`, `key_ciphertext bytea`, `key_iv bytea`, `key_auth_tag bytea`, `key_hint text`, `available_models text[]`, `last_test_status`, `last_tested_at`), `ai_agents` (`name text unique`, `provider_id` → ai_providers **restrict**, `model text`, `instructions text`, `history_size int default 20` with check `between 5 and 50`, `is_active boolean default true`, `created_by_user_id` → users set null), `flows` (`name text unique`, `description text null`, `status default 'draft'`, `trigger_type null`, `priority int default 100`, `current_version_id` → flow_versions null, `activated_at null`, `created_by_user_id`/`updated_by_user_id` → users set null), `flow_versions` (`flow_id` → flows cascade, `number int`, unique `(flow_id, number)`, `graph jsonb`, `created_by_user_id` set null), `flow_runs` (`flow_id` cascade, `version_id` → flow_versions cascade, `conversation_id` → conversations cascade, `origin`, `status`, `current_node_id text null`, `state jsonb default '{}'`, `resume_at null`, `lease_until null`, `steps_count int default 0` check `>= 0`, `started_by_user_id` set null, `started_at default now()`, `finished_at null`, `end_reason text null`, `error text null`; unique index `(conversation_id) WHERE status IN ('running','waiting')`, index `(resume_at) WHERE status = 'waiting'`, index `(flow_id, started_at DESC)`, index `(finished_at) WHERE finished_at IS NOT NULL`), `flow_run_steps` (`run_id` cascade, `node_id text`, `node_type text`, `status`, `input jsonb null`, `output jsonb null`, `error text null`, `started_at`, `finished_at null`; index `(run_id, started_at)`); new columns `conversations.handling_mode default 'automation'`, `handoff_reason text null`, `handoff_summary text null`, `handoff_at null`, `assumed_by_user_id` → users set null; `contacts.automation_opt_out_at null`, `automation_opt_out_by_user_id` → users set null; `messages.flow_run_id` → flow_runs set null, `messages.ai_agent_id` → ai_agents set null, plus check `NOT (sent_by_user_id IS NOT NULL AND flow_run_id IS NOT NULL)`; export `…Row` types for each new table
- [ ] T005 Run `npm run db:generate -w backend` to create `backend/src/db/migrations/0001_*.sql`, then append `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;` for `ai_providers`, `ai_agents`, `flows`, `flow_versions`, `flow_runs`, `flow_run_steps`; resolve the `flows.current_version_id` ↔ `flow_versions.flow_id` cycle by adding that FK in a trailing `ALTER TABLE flows ADD CONSTRAINT …` if drizzle-kit emits it out of order; confirm `npm run db:migrate -w backend` applies and that `createTestDb()` picks it up

### Shared backend pieces

- [X] T006 [P] Implement AES-256-GCM `encryptSecret(plain, key) → { ciphertext, iv, authTag }` and `decryptSecret(...)` with `node:crypto` (12-byte IV, 16-byte tag) plus `keyHint(plain)` (last 4 chars prefixed `…`) in `backend/src/lib/secret-box.ts`; tests in `backend/src/lib/secret-box.test.ts` (round trip, tampered tag throws, wrong key throws, IV differs per call)
- [ ] T007 [P] Add `{ type: 'run.updated'; data: { run: RunSummaryDto } }` to `RealtimeEvent` in `backend/src/realtime/bus.ts`; extend `backend/src/realtime/bus.test.ts`
- [ ] T008 Extend `backend/src/controllers/dto.ts` per contracts/openapi.yaml: `ConversationDto.handling { mode, reason, summary, handoffAt, assumedBy }` and `automationOptOut: boolean`; `MessageDto.automation: { kind: 'flow' | 'agent', name } | null` (agent wins over flow when both set); new `FlowSummaryDto`, `FlowDto`, `RunSummaryDto`, `RunDetailDto`, `AiProviderDto` (never includes key material; `keyHint` only), `AiAgentDto`; tests in `backend/src/controllers/dto.test.ts`
- [ ] T009 [P] Write tests in `backend/src/models/conversation.test.ts` for: `handOff(db, id, { reason, summary })` sets `handling_mode='human'`, `handoff_at=now`, clears `assumed_by_user_id`; `assume(db, id, userId)` sets human + assumed; `release(db, id)` sets `automation` and nulls `handoff_reason`, `handoff_summary`, `handoff_at`, `assumed_by_user_id`; `findById`/`list` return `assumedBy { id, name }` and `contact.automationOptOutAt`; `list({ handling: 'awaiting_human' })` returns only `human` with `assumed_by_user_id IS NULL`
- [ ] T010 Implement those functions in `backend/src/models/conversation.ts` (depends on T009)
- [ ] T011 [P] Write tests in `backend/src/models/contact.test.ts` for `setOptOut(db, id, byUserId | null)` and `clearOptOut(db, id)`; implement in `backend/src/models/contact.ts`
- [ ] T012 [P] Write tests in `backend/src/models/message.test.ts` for: `insertPending` accepting `flowRunId` and `aiAgentId`; `findById` and history listing returning `automation` source names (`flowName` via flow_runs → flows, `agentName` via ai_agents); `listRecentForAgent(db, conversationId, limit)` returning the last `limit` messages oldest-first with `direction`, `type`, `body`; `latestInbound(db, conversationId)`; `countOutboundSince(db, conversationId, at)`. Implement in `backend/src/models/message.ts`
- [ ] T013 [P] Write tests in `backend/src/models/flow.test.ts` (flows + flow_versions): `create` (unique name → `conflict('FLOW_NAME_TAKEN')`), `findById` with current version graph and `versionNumber`, `list({ status, trigger })` with `lastRunAt`, `update(name, description, priority)`, `saveVersion(db, flowId, graph, triggerType, userId)` assigns `number = max + 1` in one transaction and sets `current_version_id` and `trigger_type`, `setStatus` (sets `activated_at` when active), `remove`, `listActiveByTrigger(db, 'message_received')` ordered by `priority ASC, activated_at ASC` returning `{ flow, version }`, `findActiveReferencingAgent(db, agentId)` (active flows whose current graph has an `ai_agent` node with that `agentId`). Implement in `backend/src/models/flow.ts`
- [ ] T014 Write tests in `backend/src/models/flow-run.test.ts`: `create` (second active run on same conversation → `conflict('RUN_ALREADY_ACTIVE', 'Já existe uma automação em andamento nesta conversa.')` from the partial unique index), `findActiveByConversation`, `update(db, id, patch)`, `claimDue(db, now, leaseMs, limit)` picks `waiting` with `resume_at <= now` and `running` with `lease_until < now` using `FOR UPDATE SKIP LOCKED`, sets `status='running'` and `lease_until = now + leaseMs`, never returns terminal runs; `addStep` truncates `input`/`output` over 8 KB with marker `"…(truncado)"`; `finish(db, id, status, endReason, error?)` sets `finished_at`; `cancelActiveForFlow(db, flowId, endReason)` returns cancelled ids; `listByFlow` with cursor on `started_at`; `listByConversation(limit 20, active first)`; `findDetail` (run + version graph + steps ordered by `started_at`); `deleteFinishedBefore(db, date)`; `deleteOrphanVersions(db)` (not current, no runs)
- [ ] T015 Implement `backend/src/models/flow-run.ts` (depends on T014)
- [ ] T016 Refactor `backend/src/controllers/messages.ts`: extract the `insertPending → touch → publishCreated → deliver` path into exported `sendAutomated(ctx, { conversationId, text } | { conversationId, media: { mediaPath, mime, filename, caption } }, { flowRunId, aiAgentId? }) → MessageDto` (throws `conflict('WHATSAPP_DISCONNECTED')` when disconnected; returns the DTO with `status: 'failed'` when Evolution fails); keep `sendText`/`sendMedia` behavior identical; add cases to `backend/src/controllers/messages.test.ts`
- [ ] T017 Implement `handOff(ctx, conversationId, { reason, summary? })` in `backend/src/controllers/handling.ts`: cancels the conversation's active run (`end_reason='handoff'`, publishes `run.updated`), calls `conversationModel.handOff`, publishes `conversation.updated`; summary defaults to the last 5 messages as plain text lines ("Contato: …" / "Automação: …"), max 1.000 chars; tests in `backend/src/controllers/handling.test.ts`
- [X] T018 [P] Implement the graph Zod schema in `backend/src/controllers/automation/graph-schema.ts` per contracts/flow-graph.md: discriminated union on `type` for all 10 block types with the exact config rules (e.g. `send_text.text` 1–4.096 chars, `wait` total ≤ 30 days, `wait_reply.timeout` between 1 minute and 30 days, `condition.value` ≤ 200 chars, `trigger.message_received.keywords` 1–20 items of 1–50 chars only when `match='keyword'`, `ai_agent.inactivityTimeout` default 24 h, `handoff.reason` 1–200 chars); ids `^[A-Za-z0-9_-]{1,40}$` unique; ≤ 200 nodes, ≤ 400 edges; export `OUTPUTS_BY_TYPE` and `REQUIRED_OUTPUTS_BY_TYPE`; tests in `backend/src/controllers/automation/graph-schema.test.ts`
- [X] T019 [P] Implement `renderTemplate(text, contact)` for `{{contato.nome}}`, `{{contato.primeiro_nome}}`, `{{contato.telefone}}` (missing name → phone; unknown variable → empty string) in `backend/src/controllers/automation/variables.ts`; tests in `variables.test.ts`
- [X] T020 [P] Add frontend types for every new DTO and the graph (`FlowGraph`, `FlowNode`, `NodeType`, `RunSummary`, `RunDetail`, `AiProvider`, `AiAgent`, `Handling`, `Message.automation`) in `frontend/src/lib/types.ts`, and update `frontend/src/test/fixtures.ts` so existing chat tests still build (`handling: { mode: 'automation', … }`, `automationOptOut: false`, `automation: null`)

**Checkpoint**: Migration applies, all existing tests pass, new models/DTOs tested

---

## Phase 3: User Story 1 - Montar um fluxo visual e ativá-lo (Priority: P1) 🎯 MVP

**Goal**: Admin builds a flow in the visual editor, saves versions, activates it, and it runs automatically on inbound messages with send text/media, wait, wait for reply, condition and end blocks.

**Independent Test**: quickstart.md steps 2–3 (welcome flow reaches a never-seen number in ~5 s and shows "Automação: Boas-vindas"; editing an active flow does not change runs already in progress).

### Tests for User Story 1 ⚠️

- [X] T021 [P] [US1] Write tests for `validateForActivation(graph, { findAgent, mediaExists })` in `backend/src/controllers/automation/graph-validation.test.ts`: exactly one trigger; every node reachable from the trigger; ≤ 1 edge per output handle; the trigger `next` output connected, every other output allowed to dangle (ends the run); each `agentId` exists and is active; each `mediaPath` exists; returns `issues: [{ nodeId?, edgeId?, message }]` in pt-BR
- [ ] T022 [P] [US1] Write tests for node executors in `backend/src/controllers/automation/nodes/*.test.ts`: `send-text` renders variables and calls `sendAutomated` with `flowRunId`, returns `{ next: 'next' }`; send failure or `WHATSAPP_DISCONNECTED` → `{ fail: message, handOff: true }`; `send-media` same with media; `wait` → `{ wait: { resumeAt } }` from amount/unit; `wait-reply` first entry → waits with `state.awaitingReply` and `timeoutAt`, resume with reply → `replied`, resume after timeout → `timeout`; `condition` evaluates `last_message|contact_name|contact_phone` with `contains|equals|starts_with|is_empty`, case- and accent-insensitive → `yes`/`no`; `end` → `{ complete: true }`
- [ ] T023 [P] [US1] Write tests for the engine in `backend/src/controllers/automation/engine.test.ts` (models and node executors mocked): `start` creates the run (`origin`, version) and advances; `advance` follows edges by output handle, records one step per node (`ok`/`failed` with input/output), marks `completed` on `end` or a dangling output, `failed` with `end_reason='loop_limit'` at `MAX_STEPS = 100`, `waiting` with `resume_at` on waits, calls `handling.handOff` when a node asks for it; publishes `run.updated` on every state change; `resume(runId, { reply? })` re-enters the current node; `cancel(runId, endReason)`; `tick(now)` claims due runs via `flowRunModel.claimDue` and advances each, one failure not stopping the others; a run whose flow was deactivated is cancelled with `flow_deactivated` instead of advanced
- [ ] T024 [P] [US1] Write tests for `onInboundMessage(ctx, { conversation, contact, message })` in `backend/src/controllers/automation/triggers.test.ts`: ignores outbound and messages from the automation itself; resumes a run waiting on `wait_reply`; does nothing when another run is active (e.g. fixed `wait`); otherwise starts the first matching active `message_received` flow by priority (`first_message` = conversation has exactly this one inbound message; `keyword` contains any keyword ignoring case/accents; `any`); starts nothing when no flow matches
- [ ] T025 [P] [US1] Write tests for the flows controller in `backend/src/controllers/flows.test.ts`: create/rename/describe/priority; `saveGraph` parses with graph-schema (422 `VALIDATION_ERROR` on shape errors), on an `active` flow also requires `validateForActivation` (422 `INVALID_FLOW` with `issues`), creates a new version and updates `trigger_type`; `activate` without version or with issues → 422 `INVALID_FLOW`; `deactivate` cancels active runs with `flow_deactivated` and publishes `run.updated`; `duplicate` → draft "<nome> (cópia)" with the current graph; `remove` on `active` → 409 `FLOW_ACTIVE`; `uploadAsset` reuses `classifyUpload` limits and stores under `automation/<uuid>/<filename>`
- [ ] T026 [P] [US1] Write route tests in `backend/src/routes/flows.test.ts`: all flow and flow-asset routes return 403 for attendants and 401 without session (FR-029); happy paths return the exact shapes of contracts/openapi.yaml
- [X] T027 [P] [US1] Write tests for the worker in `backend/src/jobs/automation-worker.test.ts` with fake timers: calls `engine.tick` every `WORKER_TICK_MS`, does not overlap ticks when one is slow, `stop()` clears the interval, a thrown tick is logged and the next tick still runs

### Implementation for User Story 1

- [X] T028 [US1] Implement `backend/src/controllers/automation/graph-validation.ts` (depends on T018, T021)
- [ ] T029 [P] [US1] Implement node executors `send-text.ts`, `send-media.ts`, `wait.ts`, `wait-reply.ts`, `condition.ts`, `end.ts` and the registry `index.ts` (type → executor) in `backend/src/controllers/automation/nodes/`; each exports `run(ctx, run, node, input) → NodeResult` (depends on T016, T019, T022)
- [ ] T030 [US1] Implement `start`, `advance`, `resume`, `cancel`, `tick` in `backend/src/controllers/automation/engine.ts` with `MAX_STEPS`, `RUN_LEASE_MS`; `advance` loops synchronously through non-waiting nodes and refreshes the lease each step (depends on T015, T017, T029, T023)
- [ ] T031 [US1] Implement `onInboundMessage` in `backend/src/controllers/automation/triggers.ts` (depends on T013, T030, T024)
- [ ] T032 [US1] Call `triggers.onInboundMessage` from `receive` in `backend/src/controllers/messages.ts` after the message is created and published, only for new inbound messages, as fire-and-forget (`void …catch(err => ctx.log.error(...))`) so the Evolution webhook never waits for automation; add the case to `backend/src/controllers/messages.test.ts`
- [ ] T033 [US1] Implement `backend/src/jobs/automation-worker.ts` (`startAutomationWorker(ctx) → { stop }`) and start it in `backend/src/server.ts`, stopping it in the `onClose` hook (depends on T027, T030)
- [ ] T034 [US1] Implement `backend/src/controllers/flows.ts` (list, get, create, update, saveGraph, activate, deactivate, duplicate, remove, uploadAsset, getAsset) (depends on T013, T015, T028, T025)
- [ ] T035 [US1] Implement `backend/src/routes/flows.ts` (`/api/flows`, `/api/flows/:id`, `/graph`, `/activate`, `/deactivate`, `/duplicate`, `/api/flow-assets`, `/api/flow-assets/*`) with `requireAdmin` and Zod schemas; register in `backend/src/app.ts` (depends on T034, T026)
- [ ] T036 [P] [US1] Add flow queries and mutations (`useFlows`, `useFlow`, `useCreateFlow`, `useUpdateFlow`, `useSaveGraph`, `useActivateFlow`, `useDeactivateFlow`, `useDuplicateFlow`, `useDeleteFlow`, `useUploadFlowAsset`; query keys `['flows', filters]`, `['flow', id]`) in `frontend/src/lib/use-automation.ts`
- [X] T037 [P] [US1] Add "Automações" (link `/automacoes`) to `frontend/src/components/panel-nav.tsx`, visible only when `me.role === 'admin'`; test in `panel-nav.test.tsx`
- [X] T038 [P] [US1] Write tests, then implement the flow list page in `frontend/src/app/(painel)/automacoes/page.tsx` + `frontend/src/components/automation/flow-list.tsx`: table with name, status badge (Rascunho/Ativo/Inativo), gatilho, prioridade (editable number), última execução; actions criar, abrir, ativar/desativar, duplicar, excluir (disabled while ativo); tablet/phone shows the list and toggle only
- [ ] T039 [P] [US1] Write tests, then implement one visual node component per implemented type in `frontend/src/components/automation/node-types/` (`trigger-node.tsx`, `send-text-node.tsx`, `send-media-node.tsx`, `wait-node.tsx`, `wait-reply-node.tsx`, `condition-node.tsx`, `end-node.tsx`, and `index.ts` mapping `type` → component): brand colors, one target handle (none on triggers), one source handle per output labeled in pt-BR (`sim`/`não`, `respondeu`/`sem resposta`), error outline + message when the node has an issue
- [X] T040 [P] [US1] Write tests, then implement `frontend/src/components/automation/node-config-panel.tsx`: form for the selected node's `config` per contracts/flow-graph.md (trigger match + keywords, text with variable chips `{{contato.primeiro_nome}}`…, media upload via `useUploadFlowAsset`, amount + unit selects, condition source/operator/value), client-side limits mirroring the backend, changes lifted to the editor
- [ ] T041 [US1] Write tests, then implement `frontend/src/components/automation/flow-editor.tsx` with `@xyflow/react`: palette to drag or click-add blocks, connect handles (one edge per source handle), delete nodes/edges, zoom/pan controls, "Salvar" (`useSaveGraph`), "Ativar"/"Desativar"; 422 `INVALID_FLOW` issues highlight nodes via T039; unsaved-changes warning on navigation (depends on T039, T040)
- [ ] T042 [US1] Implement the editor page `frontend/src/app/(painel)/automacoes/[id]/page.tsx` (loads `useFlow`, renders `flow-editor`; on screens < 1024 px shows read-only notice per spec Assumptions)
- [X] T043 [P] [US1] Show "Automação: <fluxo>" / "IA: <agente>" above outbound bubbles with `automation` in `frontend/src/components/chat/message-bubble.tsx`; test in `message-bubble.test.tsx`

**Checkpoint**: US1 fully functional: build, save, activate, auto-run a welcome flow end-to-end

---

## Phase 4: User Story 2 - Agente de IA respondendo conversas (Priority: P1)

**Goal**: Admin registers AI providers (tested, encrypted), creates agents and uses them as a flow block that answers the contact with conversation history, debounced, with hand-off and failure safety.

**Independent Test**: quickstart.md steps 1, 4, 6, 7.

### Tests for User Story 2 ⚠️

- [X] T044 [P] [US2] Write tests for each provider module with mocked `fetch` in `backend/src/integrations/ai/openai.test.ts`, `anthropic.test.ts`, `gemini.test.ts`: request shape (URL, auth header, model, system, messages, tool definitions from `tools.ts`), text reply parsed, tool call parsed into `{ name, args }`, non-2xx / invalid JSON / schema mismatch / abort → `DomainError('AI_PROVIDER_ERROR', …, 502)` without the API key in the message; `testConnection` lists models (`GET /v1/models`, `GET /v1beta/models`) and returns ids
- [X] T045 [P] [US2] Write tests in `backend/src/models/ai-provider.test.ts` (create; unique name → `conflict('PROVIDER_NAME_TAKEN')`; update key fields; `list` with `agentCount`; `remove`) and `backend/src/models/ai-agent.test.ts` (create/update/list/findById with provider; unique name; `history_size` check 5–50 rejected by DB; `provider_id` restrict on delete; `listByProvider`)
- [X] T046 [P] [US2] Write tests for `backend/src/controllers/ai-providers.test.ts`: create tests the connection first (failure → 422 `AI_PROVIDER_TEST_FAILED`, nothing saved), stores encrypted key + `keyHint` + `availableModels`; DTO never contains the key; update with new key re-tests; `retest` refreshes models; delete with agents → 409 `PROVIDER_IN_USE` listing agent names
- [X] T047 [P] [US2] Write tests for `backend/src/controllers/ai-agents.test.ts`: `model` must be in the provider's `availableModels` (422); `instructions` 1–8.000 chars; toggle `isActive`; delete while `findActiveReferencingAgent` returns flows → 409 `AGENT_IN_USE` listing flow names
- [ ] T048 [P] [US2] Write tests for `backend/src/controllers/automation/nodes/ai-agent.test.ts`: agent inactive → `unavailable` output; on entry replies only if the latest message is inbound, else waits; history built from `listRecentForAgent(history_size)` with media as "[imagem]"/"[áudio]"/…; contact text passed only as user messages, never appended to `instructions`; text reply → `sendAutomated` with `aiAgentId` then waits (`state.awaitingReply`, inactivity `timeoutAt`); tool `encerrar_atendimento` → `completed`; tool `transferir_para_humano(motivo)` → `handOff` with the model's reason; provider error or timeout (`PROVIDER_TIMEOUT_MS`) → no message sent, step failed, run `failed`, `handOff` with reason "Falha no agente de IA"; inactivity timeout → `no_reply`
- [ ] T049 [P] [US2] Extend `backend/src/controllers/automation/triggers.test.ts`: inbound on a run waiting in an `ai_agent` node sets `resume_at = now + AGENT_DEBOUNCE_MS` instead of resuming immediately; three quick messages keep pushing `resume_at`, so the agent replies once
- [X] T050 [P] [US2] Write route tests in `backend/src/routes/ai-providers.test.ts` and `backend/src/routes/ai-agents.test.ts` (admin only; shapes per openapi; response bodies never contain `apiKey`)

### Implementation for User Story 2

- [X] T051 [US2] Implement `backend/src/integrations/ai/tools.ts` (two tool definitions `transferir_para_humano { motivo: string }` and `encerrar_atendimento { resumo: string }`, JSON-schema form), `backend/src/integrations/ai/index.ts` (`AiProvider` interface `generate({ apiKey, model, system, messages, tools, signal }) → { text, toolCalls }` and `testConnection(apiKey) → string[]`; `createAiRegistry()` keyed by `ai_vendor`), and `openai.ts` (`POST https://api.openai.com/v1/responses`), `anthropic.ts` (official `@anthropic-ai/sdk`: `messages.create` with tools, `models.list`; read the claude-api skill's TypeScript README before writing), `gemini.ts` (`POST …/v1beta/models/{model}:generateContent`, `x-goog-api-key`), each response parsed with Zod (depends on T044)
- [X] T052 [US2] Add `ai: AiRegistry` to `AppContext` in `backend/src/context.ts`, wire `createAiRegistry()` in `backend/src/server.ts`, add a fake in `backend/src/test/context.ts`
- [X] T053 [P] [US2] Implement `backend/src/models/ai-provider.ts` and `backend/src/models/ai-agent.ts` (depends on T045)
- [X] T054 [US2] Implement `backend/src/controllers/ai-providers.ts` (encrypt with `secret-box` and `config.AI_CREDENTIALS_KEY`; export `resolveCredentials(ctx, providerId) → { vendor, apiKey }` for the agent node) (depends on T006, T052, T053, T046)
- [ ] T055 [US2] Implement `backend/src/controllers/ai-agents.ts` and pass a real `findAgent` lookup into `validateForActivation` from `flows.ts` (depends on T053, T047)
- [ ] T056 [US2] Implement `backend/src/controllers/automation/nodes/ai-agent.ts` with `AbortSignal.timeout(PROVIDER_TIMEOUT_MS)`, register it in `nodes/index.ts`, and add the debounce branch to `triggers.ts` (depends on T054, T048, T049)
- [X] T057 [US2] Implement `backend/src/routes/ai-providers.ts` (`GET/POST /api/ai-providers`, `PATCH/DELETE /api/ai-providers/:id`, `POST /:id/test`) and `backend/src/routes/ai-agents.ts` (`GET/POST /api/ai-agents`, `PATCH/DELETE /api/ai-agents/:id`) with `requireAdmin`; register in `backend/src/app.ts`; ensure Fastify's request logging never logs these bodies (depends on T054, T055, T050)
- [ ] T058 [P] [US2] Add provider and agent hooks (`useAiProviders`, `useCreateAiProvider`, `useUpdateAiProvider`, `useRetestAiProvider`, `useDeleteAiProvider`, `useAiAgents`, `useCreateAiAgent`, `useUpdateAiAgent`, `useDeleteAiAgent`) in `frontend/src/lib/use-automation.ts`
- [X] T059 [P] [US2] Write tests, then implement `frontend/src/components/automation/provider-form.tsx` and `frontend/src/app/(painel)/automacoes/provedores/page.tsx`: vendor select, name, password-type key field never prefilled; list shows `keyHint`, model count, last test, "Testar de novo", excluir (409 message lists agents)
- [X] T060 [P] [US2] Write tests, then implement `frontend/src/components/automation/agent-form.tsx` and `frontend/src/app/(painel)/automacoes/agentes/page.tsx`: name, provider select, model select from `availableModels`, instructions textarea with counter (max 8.000), history size (5–50), active toggle; list with status and "Ativar/Desativar"
- [ ] T061 [US2] Add `ai-agent-node.tsx` (outputs `concluído`, `sem resposta`, `indisponível`) to `frontend/src/components/automation/node-types/` and its config (agent select from `useAiAgents`, inactivity timeout) to `node-config-panel.tsx`; add sub-navigation Fluxos / Agentes / Provedores de IA on the automações pages; tests next to each file

**Checkpoint**: US1 + US2: flows with AI agents answer, debounce, fail safely

---

## Phase 5: User Story 3 - Passar o atendimento para um humano (Priority: P1)

**Goal**: Hand-off block, attendant "assumir"/"devolver", automation silence in human mode, "aguardando humano" badge and filter, summary on hand-off, opt-out.

**Independent Test**: quickstart.md steps 5 and 10.

### Tests for User Story 3 ⚠️

- [ ] T062 [P] [US3] Write tests for `backend/src/controllers/automation/nodes/handoff.test.ts`: calls `handOff` with the node's `reason`; run ends `cancelled` with `end_reason='handoff'`
- [ ] T063 [P] [US3] Extend `backend/src/controllers/handling.test.ts`: `assume(ctx, user, conversationId)` cancels the active run (`stopped_by_user`), sets human + `assumedBy`, publishes `conversation.updated`; `release` sets automation; `setOptOut`/`clearOptOut` (manual, `byUserId`) cancel the active run with `opt_out`; `handOff` with an agent summary uses `ctx.ai` (≤ 3 sentences, `PROVIDER_TIMEOUT_MS`) and falls back to the last 5 messages on failure
- [ ] T064 [P] [US3] Extend `backend/src/controllers/automation/triggers.test.ts`: conversation in `human` mode → nothing starts or resumes; contact with `automation_opt_out_at` → nothing; inbound text that normalizes (trim, lowercase, no accents, no trailing punctuation) to exactly `parar`, `sair` or `descadastrar` → `contactModel.setOptOut(null)`, active run cancelled with `opt_out`, no flow starts; "não quero sair agora" is not an opt-out
- [ ] T065 [P] [US3] Extend `backend/src/controllers/messages.test.ts`: attendant `sendText`/`sendMedia` on a conversation in `automation` mode calls `handling.assume` before sending; automated sends (`sendAutomated`) never do
- [X] T066 [P] [US3] Write route tests in `backend/src/routes/conversations.test.ts` (`handling=awaiting_human` filter, `POST /:id/assume`, `POST /:id/release`) and `backend/src/routes/contacts.test.ts` (`PUT`/`DELETE /api/contacts/:id/automation-opt-out`), all available to attendants

### Implementation for User Story 3

- [ ] T067 [US3] Implement `backend/src/controllers/automation/nodes/handoff.ts` and register it (depends on T017, T062)
- [ ] T068 [US3] Implement `assume`, `release`, `setOptOut`, `clearOptOut` and the agent summary in `backend/src/controllers/handling.ts` (depends on T063)
- [ ] T069 [US3] Add the human-mode, opt-out and opt-out-keyword guards at the top of `onInboundMessage` in `backend/src/controllers/automation/triggers.ts` (depends on T068, T064)
- [ ] T070 [US3] Call `handling.assume` from attendant `sendText`/`sendMedia` in `backend/src/controllers/messages.ts` when the conversation is in `automation` mode (depends on T068, T065)
- [X] T071 [US3] Add `handling` query filter and `POST /api/conversations/:id/assume` / `release` to `backend/src/routes/conversations.ts`; create `backend/src/routes/contacts.ts` with the opt-out routes; register in `backend/src/app.ts` (depends on T068, T066)
- [X] T072 [P] [US3] Apply `handling` and `automationOptOut` from `conversation.updated` to the `['conversations', filters]` and `['messages', id]` caches in `frontend/src/lib/chat-cache.ts` (drop from the `awaiting_human` list when assumed/released); tests in `chat-cache.test.ts`
- [X] T073 [P] [US3] Write tests, then implement `frontend/src/components/chat/handoff-banner.tsx` at the top of the open conversation: "Aguardando humano" / "Assumida por <nome>", motivo, resumo, flow/agent that answered, buttons "Assumir", "Devolver para automação", and "Não automatizar" toggle (opt-out)
- [X] T074 [P] [US3] Add the "Aguardando humano" badge to `frontend/src/components/chat/conversation-list.tsx` and the filter chip to `frontend/src/components/chat/conversation-search.tsx` (query param `handling=awaiting_human` in `frontend/src/lib/use-chat.ts`); tests next to each file
- [ ] T075 [US3] Add `handoff-node.tsx` to `frontend/src/components/automation/node-types/` (terminal, no outputs) and its `reason` field to `node-config-panel.tsx`; tests

**Checkpoint**: US1–US3: safe hand-off, human silence, filter, opt-out

---

## Phase 6: User Story 4 - Disparar um fluxo a partir do chat (Priority: P2)

**Goal**: Attendant starts a manual flow on an open conversation or a new number and can stop it; the chat shows "automação em andamento".

**Independent Test**: quickstart.md step 8.

### Tests for User Story 4 ⚠️

- [X] T076 [P] [US4] Add `checkWhatsAppNumber(phone) → { exists, jid }` to `backend/src/integrations/evolution/client.ts` (`POST /chat/whatsappNumbers/{instance}` with `{ numbers: [phone] }`) with its Zod schema in `response-schemas.ts`; tests in `client.test.ts`
- [X] T077 [P] [US4] Write tests for `backend/src/controllers/runs.test.ts` (manual part): `startManual(ctx, user, conversationId, flowId)` requires flow `active` with `trigger_type='manual'` (else 422 `FLOW_NOT_STARTABLE`), contact not opted out (409 `CONTACT_OPTED_OUT`), WhatsApp connected (409 `WHATSAPP_DISCONNECTED`), no active run (409 `RUN_ALREADY_ACTIVE`); sets the conversation to `automation` mode, starts with `origin='manual'`, `started_by_user_id`; `startManualForPhone` validates `^\d{10,15}$`, checks the number (422 `PHONE_NOT_ON_WHATSAPP`), upserts contact + conversation and starts; `cancel(ctx, runId)` → `stopped_by_user` (409 `RUN_FINISHED` if terminal); `listForConversation`
- [X] T078 [P] [US4] Write route tests in `backend/src/routes/runs.test.ts` and extend `backend/src/routes/conversations.test.ts` / `flows.test.ts`: `POST /api/conversations/:id/start-flow`, `POST /api/conversations/start-flow`, `GET /api/conversations/:id/runs`, `POST /api/runs/:id/cancel` available to attendants; `GET /api/flows` allowed for attendants only with `trigger=manual&status=active` (other filters → 403)

### Implementation for User Story 4

- [X] T079 [US4] Implement `startManual`, `startManualForPhone`, `cancel`, `listForConversation` in `backend/src/controllers/runs.ts` (depends on T030, T076, T077)
- [X] T080 [US4] Implement `backend/src/routes/runs.ts` (`POST /api/runs/:id/cancel`), add the start-flow and runs routes to `backend/src/routes/conversations.ts`, relax the attendant rule on `GET /api/flows` in `backend/src/routes/flows.ts`; register in `backend/src/app.ts` (depends on T079, T078)
- [X] T081 [P] [US4] Add `useManualFlows`, `useStartFlow`, `useStartFlowForPhone`, `useConversationRuns`, `useCancelRun` to `frontend/src/lib/use-automation.ts`; handle `run.updated` in `frontend/src/lib/use-events.ts` by updating `['conversation-runs', conversationId]` and invalidating `['runs', flowId]`; tests in `use-events.test.ts`
- [X] T082 [P] [US4] Write tests, then implement `frontend/src/components/chat/start-flow-menu.tsx` in the conversation header: lists manual active flows with name and description, confirm dialog, error toasts for 409/422 messages; plus a "Nova conversa" entry in the conversation list header taking a phone number and a flow
- [X] T083 [P] [US4] Write tests, then implement `frontend/src/components/chat/automation-indicator.tsx`: shows "Automação em andamento: <fluxo>" while the conversation has a `running`/`waiting` run, "Parar" button calls `useCancelRun`, disappears on terminal status

**Checkpoint**: US1–US4 functional

---

## Phase 7: User Story 5 - Acompanhar execuções e corrigir problemas (Priority: P2)

**Goal**: Run history per flow, run detail with highlighted path and per-block input/output/error, live test run on a draft, 90-day retention.

**Independent Test**: quickstart.md step 9.

### Tests for User Story 5 ⚠️

- [ ] T084 [P] [US5] Extend `backend/src/controllers/runs.test.ts`: `listByFlow(ctx, flowId, { status, cursor, limit })`; `getDetail(ctx, runId)` (404 when missing); `startTest(ctx, user, flowId, { graph, phone })` saves the graph as a new version, requires `validateForActivation` (422 `INVALID_FLOW`), upserts the test contact/conversation, starts with `origin='test'` ignoring flow status and priority
- [ ] T085 [P] [US5] Extend `backend/src/jobs/automation-worker.test.ts`: once per hour calls `flowRunModel.deleteFinishedBefore(now − RUN_RETENTION_DAYS)` and `deleteOrphanVersions`
- [ ] T086 [P] [US5] Extend `backend/src/routes/flows.test.ts` and `runs.test.ts`: `GET /api/flows/:id/runs` and `POST /api/flows/:id/test` admin only; `GET /api/runs/:id` for any logged-in user

### Implementation for User Story 5

- [ ] T087 [US5] Implement `listByFlow`, `getDetail`, `startTest` in `backend/src/controllers/runs.ts` (depends on T079, T084)
- [ ] T088 [US5] Add the hourly retention job to `backend/src/jobs/automation-worker.ts` (depends on T085)
- [ ] T089 [US5] Add `GET /api/flows/:id/runs`, `POST /api/flows/:id/test` to `backend/src/routes/flows.ts` and `GET /api/runs/:id` to `backend/src/routes/runs.ts` (depends on T087, T086)
- [ ] T090 [P] [US5] Add `useFlowRuns` (infinite, cursor), `useRun`, `useTestFlow` to `frontend/src/lib/use-automation.ts`
- [X] T091 [P] [US5] Write tests, then implement `frontend/src/app/(painel)/automacoes/[id]/execucoes/page.tsx`: newest first, status filter, columns situação, conversa (contact name/phone), início, duração, selo "teste", infinite scroll
- [ ] T092 [P] [US5] Write tests, then implement `frontend/src/components/automation/run-path-view.tsx` (read-only React Flow of the run's version with visited nodes/edges highlighted and the failed node in red; side list of steps with input/output/error) and the page `frontend/src/app/(painel)/automacoes/execucoes/[runId]/page.tsx`
- [ ] T093 [US5] Add "Testar" to `frontend/src/components/automation/flow-editor.tsx`: dialog for the test phone, calls `useTestFlow` with the current unsaved graph, then highlights `currentNodeId` live from `run.updated` and shows steps from `useRun`; tests in `flow-editor.test.tsx` (depends on T041, T090)

**Checkpoint**: All five user stories independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, gates and end-to-end validation

- [ ] T094 [P] Update `CLAUDE.md`: point "current feature" to `specs/003-automation-flows-ai-agents/`; add an **Automations** paragraph (graph versions, engine in `controllers/automation/`, worker in `jobs/`, `resume_at` + `SKIP LOCKED`, one active run per conversation, hand-off and human mode, AI providers via `fetch` + Zod, `AI_CREDENTIALS_KEY`)
- [ ] T095 [P] Add a security test in `backend/src/routes/ai-providers.test.ts` that captures the Fastify logger output during create/update and asserts the API key string never appears in logs or error bodies
- [ ] T096 Run `npm run test:coverage -w backend` (≥ 80% lines in `src/models/**` and `src/controllers/**`), `npm test -w frontend`, `npm run lint`, `npm run typecheck`; fix failures
- [ ] T097 Run the quickstart.md manual validation (steps 1–12) against a connected number and record results in `specs/003-automation-flows-ai-agents/quickstart.md` under a "Resultado" note, including measured times for SC-002 (≤ 5 s) and SC-003 (≤ 15 s)

---

## Progress notes

- 2026-09-22: implemented while another session implements feature 002 in the same tree, so only
  **new files** were created; edits to shared files (`schema.ts`, migrations, `app.ts`,
  `server.ts`, `context.ts`, `config.ts`, `dto.ts`, `messages.ts`, `bus.ts`, existing chat
  components, `package.json`, `types.ts`, `setup.ts`) wait until 002 is done. Partially done (not
  marked):
  - T020/T036/T058/T081/T090 frontend part: types in `frontend/src/lib/automation-types.ts` (new
    file instead of `types.ts`) and all hooks in `frontend/src/lib/use-automation.ts`.
  - T033: `jobs/automation-worker.ts` done (takes `tick`/`cleanup` callbacks); wiring in
    `server.ts` pending. T085/T088: hourly cleanup call is in the worker and tested; the model
    functions it calls come with T014/T015.
  - T044/T051: `integrations/ai/{index,tools,openai,gemini}.ts` + tests done; `anthropic.ts`
    waits for `@anthropic-ai/sdk` (T001).
  - T022/T029: pure `evaluateCondition` in `controllers/automation/nodes/condition.ts`; executors
    wait for the models.
  - Frontend components done as new files (tests next to each): automation subnav, flow list +
    `/automacoes`, providers page, agents page, run list + `/automacoes/[id]/execucoes`,
    node config panel (all block types, incl. agent and handoff forms from T061/T075) with
    `node-defaults.ts`, handoff banner, automation indicator, start-flow menu,
    new-conversation-by-phone form (T082), `automation-label.tsx` (T043: still to plug into
    `message-bubble.tsx`). Still to wire into existing files: nav item (T037), chat page / conversation
    list / bubble (T043, T074), `use-events`/`chat-cache` (T072, T081).
  - Activation rule changed while implementing T021: only the trigger `next` output is required;
    any other dangling output ends the run (contracts/flow-graph.md updated).

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; BLOCKS every story
- **US1 (Phase 3)**: depends on Foundational; provides the engine, triggers, flows API and editor
- **US2 (Phase 4)**: depends on US1 (engine, node registry, editor)
- **US3 (Phase 5)**: depends on US1; its agent summary (T068) uses `ctx.ai` from US2 (T052). If US3 is built before US2, keep only the "last 5 messages" fallback and add the summary later
- **US4 (Phase 6)**: depends on US1
- **US5 (Phase 7)**: depends on US1 and on `runs.ts` from US4 (T079)
- **Polish (Phase 8)**: after the stories you ship

### Within Each User Story

- Test tasks first; confirm they fail
- Models → controllers → routes → frontend hooks → components/pages
- `node-config-panel.tsx`, `nodes/index.ts`, `triggers.ts`, `flow-editor.tsx`, `use-automation.ts` are touched by several stories: never run two tasks on the same file in parallel

### Parallel Opportunities

- Setup: T002, T003
- Foundational: T006, T007, T009, T011, T012, T013, T018, T019, T020 in parallel; then T010, T014 → T015, T016, T017
- US1: all test tasks T021–T027 in parallel; frontend T036–T040 and T043 in parallel with backend T028–T035
- US2: T044–T050 in parallel; T053 and T058–T060 in parallel with T051/T052
- US3: T062–T066 in parallel; T072–T074 in parallel
- US4 and US5 can run in parallel with US2/US3 once US1 is done (different files except shared ones listed above)

---

## Parallel Example: User Story 1

```bash
# Tests first, all together:
Task: "graph-validation tests in backend/src/controllers/automation/graph-validation.test.ts"
Task: "node executor tests in backend/src/controllers/automation/nodes/*.test.ts"
Task: "engine tests in backend/src/controllers/automation/engine.test.ts"
Task: "trigger tests in backend/src/controllers/automation/triggers.test.ts"
Task: "flows controller tests in backend/src/controllers/flows.test.ts"

# Frontend while the backend engine is built:
Task: "flow list page in frontend/src/app/(painel)/automacoes/page.tsx"
Task: "node components in frontend/src/components/automation/node-types/"
Task: "node config panel in frontend/src/components/automation/node-config-panel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 + Phase 2
2. Phase 3 (US1): welcome flow with text/wait/condition/wait-for-reply
3. **STOP and VALIDATE** with quickstart steps 2–3; the CRM already automates first contact

### Incremental Delivery

1. Setup + Foundational → US1 → validate (MVP)
2. US2 (AI agents) → validate steps 1, 4, 6, 7
3. US3 (hand-off UI, opt-out) → validate steps 5, 10. **Do not enable AI agents in production before US3 is done**: without the chat banner and filter, hand-offs from the agent are invisible to the team
4. US4 (trigger from chat) → step 8
5. US5 (history, test) → step 9
6. Polish → steps 11–12 and gates

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- The engine must never send from inside the webhook request: triggers are fire-and-forget (T032); the worker recovers anything interrupted
- Commit after each task or logical group; stop at any checkpoint to validate a story on its own
