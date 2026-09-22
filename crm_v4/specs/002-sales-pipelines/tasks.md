---

description: "Task list for Funis e Pipelines de Leads"
---

# Tasks: Funis e Pipelines de Leads

**Input**: Design documents from `specs/002-sales-pipelines/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml,
contracts/sse-events.md, quickstart.md

**Tests**: REQUIRED. Constitution III mandates unit tests for every model and controller and
Testing Library tests for view components with logic (explicitly including pipeline drag-and-drop).
Tests are written first and must fail before the implementation task.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md
- Paths: `backend/src/`, `frontend/src/` (web app per plan.md). Tests live next to the code.

## Conventions for every task

- Follow `CLAUDE.md` and the layering of feature 001: `routes/` validate with Zod → call
  `controllers/` → map result; `controllers/` take `ctx: AppContext` first and never import `db/`;
  `models/` take `db` first and are the only code that queries Postgres.
- Model tests use `createTestDb()` (`backend/src/test/db.ts`). Controller tests `vi.mock` the model
  modules and use `fakeContext()` (`backend/src/test/context.ts`). Route tests use
  `buildTestApp()` + `app.inject`, with a real `createTestDb()` when data matters.
- API JSON is camelCase exactly as in `contracts/openapi.yaml`; every response is shaped in
  `backend/src/controllers/dto.ts`.
- Errors: `DomainError(code, message, status)` from `backend/src/lib/errors.ts`, messages in pt-BR.
- Frontend tests use `renderWithClient` + `mockApi` (`frontend/src/test/render.tsx`),
  `@/test/next-navigation` for the router and `FakeEventSource` for SSE.
- Named constants (constitution II), exported from the model that owns them: `STAGE_LIMIT = 20`,
  `DEFAULT_STAGES`, `POSITION_GAP = 1024`, `MIN_POSITION_GAP = 1e-6` (in `models/stage.ts` /
  `models/lead.ts`), `BOARD_PAGE_SIZE = 50` (in `controllers/leads.ts`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New dependencies and scripts.

- [X] T001 Install `@dnd-kit/core@^6.3.1` and `@dnd-kit/sortable@^10.0.0` in the frontend workspace (`npm install -w frontend …`), confirm `frontend/package.json` and `package-lock.json` updated and `npm test -w frontend` still green
- [X] T002 [P] Add script `"db:seed:pipelines": "tsx --env-file=../.env scripts/seed-pipeline-leads.ts"` to `backend/package.json` (the script itself is T034)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, shared types, realtime event types, read models and the "Funis"
navigation. Every user story depends on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database

- [X] T003 Add to `backend/src/db/schema.ts` exactly per data-model.md: enums `stage_kind (open, won, lost)` and `stage_color (gray, red, orange, amber, green, teal, blue, violet)`; table `pipelines` (`name text not null`, `is_entry boolean not null default false`, `archived_at timestamptz null`, timestamps; unique index on `lower(name)` WHERE `archived_at IS NULL`; unique index on `(is_entry)` WHERE `is_entry AND archived_at IS NULL`); table `pipeline_stages` (`pipeline_id` FK cascade, `name text not null`, `color stage_color not null default 'gray'`, `kind stage_kind not null default 'open'`, `position integer not null`, timestamps; unique index `(pipeline_id, lower(name))`; index `(pipeline_id, position)`); table `leads` (`pipeline_id` FK cascade, `stage_id` FK restrict, `contact_id` FK → contacts cascade, `title text null`, `value_cents bigint null` (mode number) with check `value_cents >= 0`, `assignee_id` FK → users set null, `notes text null`, `lost_reason text null`, `position double precision not null`, `stage_entered_at timestamptz not null default now()`, `created_by_id` FK → users set null, timestamps; unique `(pipeline_id, contact_id)`; indexes `(stage_id, position, id)`, `(contact_id)`, `(assignee_id)`); table `lead_stage_changes` (`lead_id` FK cascade, `from_stage_id`/`to_stage_id` FK → pipeline_stages set null, `from_stage_name text null`, `to_stage_name text null`, `changed_by_id` FK → users set null, `changed_at timestamptz not null default now()`; index `(lead_id, changed_at desc)`); export row types `PipelineRow`, `StageRow`, `LeadRow`, `LeadStageChangeRow`
- [X] T004 Run `npm run db:generate -w backend` to create the next migration in `backend/src/db/migrations/` (rename its tag to `pipelines` in `meta/_journal.json` and the file name, e.g. `0001_pipelines.sql`), then append `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` for `pipelines`, `pipeline_stages`, `leads`, `lead_stage_changes`, and a seed block inserting the pipeline "Vendas" (`is_entry = true`) with stages Novo (open, gray, 0), Em contato (open, blue, 1), Proposta (open, amber, 2), Ganho (won, green, 3), Perdido (lost, red, 4); verify `createTestDb()` still migrates (run `npm test -w backend -- src/models/user.test.ts`)

### Backend shared pieces

- [X] T005 [P] Write tests in `backend/src/models/pipeline.test.ts` for the read functions: `list(db, { includeArchived })` returns active pipelines by name with stages ordered by `position` (seeded "Vendas" present with 5 stages); archived excluded unless `includeArchived`; `findById(db, id)` returns pipeline with stages or `null`; `findEntry(db)` returns the active entry pipeline or `null`
- [X] T006 Implement those read functions in `backend/src/models/pipeline.ts` (type `PipelineWithStages = PipelineRow & { stages: StageRow[] }`)
- [X] T007 [P] Add `lead.upserted { lead: LeadDto }`, `lead.deleted { leadId, pipelineId, stageId, contactId }` and `pipeline.changed { pipelineId }` to the `RealtimeEvent` union in `backend/src/realtime/bus.ts` per contracts/sse-events.md
- [X] T008 [P] Add DTOs to `backend/src/controllers/dto.ts` with tests in `backend/src/controllers/dto.test.ts` (create the file if absent): `toStageDto`, `toPipelineDto` (stages ordered), `toLeadDto` (from a lead row joined with contact, conversation id/unreadCount and assignee name; `contact { id, phone, name, avatarUrl }`, `assignee { id, name } | null`, dates as ISO strings), `toLeadDetailDto` (adds `notes` and `history[] { id, fromStageName, toStageName, changedBy { id, name } | null, changedAt }`), matching `Stage`, `Pipeline`, `Lead`, `LeadDetail` in contracts/openapi.yaml
- [X] T009 [P] Add `listActive(db)` (`{ id, name }` of users with `status = 'active'`, ordered by name) to `backend/src/models/user.ts` with a test in `backend/src/models/user.test.ts`; add `GET /api/users/assignable` (any logged-in user, `requireAuth`) to `backend/src/routes/users.ts` via a `listAssignable(ctx)` function in `backend/src/controllers/users.ts`; route test in `backend/src/routes/users.test.ts` (or the existing users route test file): 200 with only active users for an attendant, 401 without session
- [X] T010 Write route test `backend/src/routes/pipelines.test.ts` for `GET /api/pipelines` (401 without session; attendant gets `[Vendas]` with 5 stages; `includeArchived=true` accepted), then implement `listPipelines(ctx, { includeArchived })` in `backend/src/controllers/pipelines.ts` and the route in `backend/src/routes/pipelines.ts`; register the plugin in `backend/src/app.ts`

### Frontend shared pieces

- [X] T011 [P] Add types `StageKind`, `StageColor`, `Stage`, `Pipeline`, `Lead`, `LeadDetail`, `Board`, `BoardStage`, `UserRef` to `frontend/src/lib/types.ts` mirroring contracts/openapi.yaml
- [X] T012 [P] Add `formatBRL(cents: number | null)` (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, `null` → "—") and `formatTimeInStage(iso, now)` ("agora", "5 min", "3 h", "2 d") to `frontend/src/lib/format.ts` with tests in `frontend/src/lib/format.test.ts`
- [X] T013 [P] Add the 8 stage color tokens to `frontend/src/app/globals.css` `@theme` (`--color-stage-gray` … `--color-stage-violet`, a background and a text pair each) and extend `frontend/src/styles/contrast.test.ts` so each stage text/background pair must pass WCAG AA (4.5:1)
- [X] T014 [P] Add query hook `usePipelines({ includeArchived })` (`['pipelines', { includeArchived }]` → `GET /api/pipelines`) and `useAssignableUsers()` (`['users', 'assignable']`) to `frontend/src/lib/use-pipelines.ts`
- [X] T015 Add the "Funis" link (route `/funis`, visible to every active user) to `frontend/src/components/panel-nav.tsx` and update its test if one asserts the link list

**Checkpoint**: `npm test`, `npm run lint`, `npm run typecheck` green; `GET /api/pipelines` returns
"Vendas" with 5 stages; RLS enabled on the 4 new tables.

---

## Phase 3: User Story 1 - Mover leads entre etapas no quadro do funil (Priority: P1) 🎯 MVP

**Goal**: Board per pipeline with one column per stage, count and value total per column, cards
dragged (pointer, touch, keyboard) or moved with "Mover para" between and within stages, lost
reason on `lost` stages, realtime updates for everyone.

**Independent Test**: with "Vendas" and leads created by `npm run db:seed:pipelines -w backend`,
drag a card from "Novo" to "Em contato", reload and see it persisted; a second window sees the
move within 3 s (quickstart steps 5 and 10).

### Tests for User Story 1 ⚠️

- [X] T016 [P] [US1] Write tests in `backend/src/models/lead.test.ts` for board reads: `stageSummaries(db, pipelineId, filter)` returns one row per stage with `leadCount` and `valueTotalCents` over ALL matching leads (including stages with zero leads → 0/0); `listByStage(db, stageId, { cursor, limit, filter })` orders by `(position, id)` ascending with keyset cursor and `nextCursor = null` at the end; filter `assignee` accepts a user id, `'none'` (assignee null) and is combined with `search` (case-insensitive match on contact name, contact phone digits, or lead title); rows include contact, conversation id, unread count and assignee name
- [X] T017 [US1] Write tests in `backend/src/models/lead.test.ts` for `move(db, { leadId, stageId, beforeLeadId, lostReason, userId })`: between two cards → position is their midpoint; `beforeLeadId` = first card → first − `POSITION_GAP`; `beforeLeadId = null` → last + `POSITION_GAP`; empty stage → 0; when the gap would fall below `MIN_POSITION_GAP` the stage is renumbered in multiples of `POSITION_GAP` in the same transaction, preserving order; changing stage updates `stage_entered_at` and inserts one `lead_stage_changes` row with from/to ids and names and `changed_by_id`; reordering within the same stage inserts no history row and keeps `stage_entered_at`; target stage `kind = 'lost'` stores `lost_reason`, moving out of a `lost` stage clears it; stage from another pipeline → `DomainError('STAGE_OTHER_PIPELINE', …, 422)`; unknown lead/stage, or `beforeLeadId` not in the target stage → `notFound`
- [X] T018 [P] [US1] Write tests in `backend/src/controllers/leads.test.ts` (models mocked): `getBoard(ctx, user, pipelineId, filter)` → 404 for unknown or archived pipeline; resolves `assignee=me` to `user.id`; returns stages with summaries and the first `BOARD_PAGE_SIZE` leads + `nextCursor` each; `listStageLeads` → 404 when the stage is not in the pipeline; `moveLead` → requires `lostReason` (1–200 chars after trim) when the target stage is `lost` (`LOST_REASON_REQUIRED` 422), calls `lead.move`, publishes `lead.upserted` with the DTO and returns it
- [X] T019 [P] [US1] Write route tests in `backend/src/routes/leads.test.ts` with a real `createTestDb()`: `GET /api/pipelines/:id/board` shape per contracts (Board), `GET /api/pipelines/:id/stages/:stageId/leads?cursor=` pagination, `POST /api/leads/:id/move` 200 and persisted, 422 for missing lost reason and non-uuid ids, 401 without session; an attendant (non-admin) can move
- [X] T020 [P] [US1] Write tests in `frontend/src/lib/pipeline-cache.test.ts` for pure helpers over the `Board` cache: `applyLeadUpsert(board, lead, filter)` removes the card from any stage and inserts it into `lead.stageId` ordered by `position`, adjusting `leadCount`/`valueTotalCents` of old and new stages (no double count when the card was already there; value delta applied when only the value changed); drops the card if it no longer matches the filter; ignores leads of another pipeline; `applyLeadDelete(board, event)` removes and decrements; `applyUnread(board, conversationId, unreadCount)` updates matching cards
- [X] T021 [P] [US1] Write tests in `frontend/src/components/pipeline/board.test.tsx`: renders one column per stage in order with name, count and `formatBRL` total; card shows contact name (or formatted phone), value, assignee, time in stage and unread badge; "Mover para" menu on a card moves it (POST `/api/leads/:id/move` with `{ stageId, beforeLeadId: null }`) and the card appears in the target column immediately (optimistic); on API error the card returns to the original column and an error message is shown; keyboard: focus card, Space, ArrowRight, Space moves it to the next column and an `aria-live` announcement in pt-BR is rendered; moving to a `lost` stage opens the lost-reason dialog; cancel restores the card; "Carregar mais" in a column fetches the next page; a `lead.upserted` SSE event from `FakeEventSource` moves a card without a request
- [X] T022 [P] [US1] Write tests in `frontend/src/components/pipeline/lost-reason-dialog.test.tsx`: submit disabled until 1–200 characters (trimmed), shows counter, Escape and "Cancelar" call `onCancel`, focus moves into the dialog and returns on close

### Implementation for User Story 1

- [X] T023 [US1] Implement `stageSummaries`, `listByStage` and the filter builder in `backend/src/models/lead.ts` (single `GROUP BY stage_id` query for summaries; `sum(value_cents)` coalesced to 0; keyset cursor encoded as base64url of `position:id`)
- [X] T024 [US1] Implement `move` in `backend/src/models/lead.ts` in one transaction (research §2), plus `findById(db, id)` returning the joined row used by `toLeadDto`
- [X] T025 [US1] Implement `getBoard`, `listStageLeads` and `moveLead` in `backend/src/controllers/leads.ts` (export `BOARD_PAGE_SIZE = 50`)
- [X] T026 [US1] Implement routes in `backend/src/routes/leads.ts` (`POST /api/leads/:leadId/move`) and add to `backend/src/routes/pipelines.ts` (`GET /api/pipelines/:pipelineId/board`, `GET /api/pipelines/:pipelineId/stages/:stageId/leads`) with Zod schemas per contracts/openapi.yaml (`assignee`: `'me' | 'none' | uuid`; `search` ≤ 100 chars; `limit` 1–100 default 50); register `leads` routes in `backend/src/app.ts`
- [X] T027 [P] [US1] Implement `applyLeadUpsert`, `applyLeadDelete`, `applyUnread` in `frontend/src/lib/pipeline-cache.ts`
- [X] T028 [US1] Add to `frontend/src/lib/use-pipelines.ts`: `useBoard(pipelineId, filter)` (`['board', pipelineId, filter]`), `useStageLeadsPage` (appends a page into the board cache), and `useMoveLead()` with optimistic update via `applyLeadUpsert`, rollback on error and `ApiError` message surfaced
- [X] T029 [US1] Handle `lead.upserted`, `lead.deleted` and `pipeline.changed` in `frontend/src/lib/use-events.ts` (apply to every cached `['board', pipelineId, …]` query and to `['leads', 'contact', contactId]`; `pipeline.changed` invalidates `['pipelines']` and `['board', pipelineId]`); also apply `message.created` unread counts to boards via `applyUnread`; invalidate pipelines/boards on SSE reconnect; extend `frontend/src/lib/use-events.test.tsx`
- [X] T030 [P] [US1] Implement `LostReasonDialog` in `frontend/src/components/pipeline/lost-reason-dialog.tsx` (native `<dialog>`, textarea 1–200)
- [X] T031 [P] [US1] Implement `LeadCard` in `frontend/src/components/pipeline/lead-card.tsx` (`useSortable`; `ContactAvatar`; title or contact name or formatted phone; `formatBRL`; assignee; `formatTimeInStage`; unread badge; "Mover para" menu listing the other stages; click opens `?lead=<id>`; visible focus ring)
- [X] T032 [US1] Implement `StageColumn` in `frontend/src/components/pipeline/stage-column.tsx` (header with stage color token, name, count, total; `SortableContext` vertical list; empty state "Nenhum lead nesta etapa"; "Carregar mais" when `nextCursor`) and `Board` in `frontend/src/components/pipeline/board.tsx` (`DndContext` with pointer, touch and keyboard sensors, `closestCorners`, `DragOverlay`, pt-BR `announcements`; on drop computes `{ stageId, beforeLeadId }` from the drop position and calls `useMoveLead`; `lost` target opens `LostReasonDialog` first; horizontal scroll with snap on small screens)
- [X] T033 [US1] Implement pages `frontend/src/app/(painel)/funis/page.tsx` (list of active pipelines as links, redirects to the entry pipeline, or the first one, when only visiting `/funis`) and `frontend/src/app/(painel)/funis/[pipelineId]/page.tsx` (pipeline switcher, `Board`, loading and error states)
- [X] T034 [US1] Implement `backend/scripts/seed-pipeline-leads.ts` (refuses non-local `DATABASE_URL` like `seed-conversations.ts`; creates up to 2,000 leads in the entry pipeline from existing contacts, spread across stages, random values and assignees, positions spaced by `POSITION_GAP`, one history row each; idempotent via `ON CONFLICT (pipeline_id, contact_id) DO NOTHING`)

**Checkpoint**: quickstart steps 5 and 10 pass with seeded leads; US1 fully functional on its own.

---

## Phase 4: User Story 2 - Transformar contatos do WhatsApp em leads (Priority: P1)

**Goal**: first inbound message of a conversation creates a lead in the entry pipeline; the chat
header shows the contact's leads (pipeline, stage, assignee), lets the attendant change the stage
or create a lead; the card opens the conversation.

**Independent Test**: send a first message from a new phone (or the `messages.upsert` webhook with
`fromMe: false`) and see the card in "Novo" within 5 s; change its stage from the chat and see the
board update (quickstart steps 4 and 6).

### Tests for User Story 2 ⚠️

- [X] T035 [P] [US2] Write tests in `backend/src/models/lead.test.ts` for `create(db, { pipelineId, contactId, stageId?, createdById })`: default stage = lowest-position `open` stage (or lowest position if none is open); new lead goes to the top of the stage (first − `POSITION_GAP`, or 0 when empty); inserts a history row with `from_stage_id = null` and `changed_by_id = createdById` (null = automatic); duplicate `(pipeline, contact)` → `conflict('LEAD_EXISTS')`; `createIfAbsent` variant returns `null` on conflict instead of throwing; `listByContact(db, contactId)` returns leads in active pipelines only, with pipeline name and stage
- [X] T036 [P] [US2] Write tests in `backend/src/models/message.test.ts` for `hasEarlierInbound(db, conversationId, messageId)`: false for the first inbound message of a conversation, true when an older inbound message exists, outbound messages ignored
- [X] T037 [P] [US2] Write tests in `backend/src/controllers/leads.test.ts` for `createLead(ctx, user, input)` (404 unknown pipeline/contact; `PIPELINE_ARCHIVED` 409; stage from another pipeline → `STAGE_OTHER_PIPELINE` 422; publishes `lead.upserted`), `listContactLeads(ctx, contactId)`, and `enterFromWhatsApp(ctx, contactId)`: no entry pipeline → no-op; creates via `createIfAbsent` with `createdById = null` and publishes `lead.upserted`; existing lead → no event; errors are logged and never thrown (receiving the message must not fail)
- [X] T038 [P] [US2] Extend `backend/src/controllers/messages.test.ts`: `receive` calls `leads.enterFromWhatsApp(ctx, contact.id)` when the created message is inbound and `hasEarlierInbound` is false; not called for outbound (`fromMe`) messages, for re-delivered webhooks (`created: false`), for groups, or when an earlier inbound exists
- [X] T039 [P] [US2] Write route tests in `backend/src/routes/leads.test.ts`: `GET /api/leads?contactId=` (422 without contactId), `POST /api/leads` 201 and 409 `LEAD_EXISTS`; and in `backend/src/routes/conversations.test.ts` an end-to-end case: the first inbound webhook for a new contact creates exactly one lead in "Vendas"/"Novo"; a second message and a repeated webhook create none
- [X] T040 [P] [US2] Write tests in `frontend/src/components/chat/lead-strip.test.tsx`: shows "Vendas · Em contato · Bia" for each lead of the contact; changing the stage select calls `POST /api/leads/:id/move` (lost stage opens `LostReasonDialog`); "Criar lead" lists only active pipelines where the contact has no lead, lets the user pick pipeline and stage, POSTs `/api/leads` and shows the new lead; hidden create action when the contact is in every pipeline; updates on `lead.upserted` for that contact
- [X] T041 [P] [US2] Extend `frontend/src/components/pipeline/board.test.tsx`: the card's "Abrir conversa" action navigates to `/chat?c=<conversationId>` and is absent when `conversationId` is null

### Implementation for User Story 2

- [X] T042 [US2] Implement `create`, `createIfAbsent` and `listByContact` in `backend/src/models/lead.ts`
- [X] T043 [P] [US2] Implement `hasEarlierInbound` in `backend/src/models/message.ts`
- [X] T044 [US2] Implement `createLead`, `listContactLeads` and `enterFromWhatsApp` in `backend/src/controllers/leads.ts`
- [X] T045 [US2] Call `leads.enterFromWhatsApp` from `receive` in `backend/src/controllers/messages.ts` after the message is created and published, only for inbound messages without an earlier inbound (research §6)
- [X] T046 [US2] Add `GET /api/leads` and `POST /api/leads` to `backend/src/routes/leads.ts` with Zod schemas per contracts/openapi.yaml
- [X] T047 [US2] Add `useContactLeads(contactId)` (`['leads', 'contact', contactId]`) and `useCreateLead()` to `frontend/src/lib/use-pipelines.ts`
- [X] T048 [US2] Implement `LeadStrip` in `frontend/src/components/chat/lead-strip.tsx` and render it inside the conversation `<header>` in `frontend/src/app/(painel)/chat/page.tsx` (below the contact name; wraps on small screens)
- [X] T049 [US2] Add "Abrir conversa" to the card menu in `frontend/src/components/pipeline/lead-card.tsx` (link to `/chat?c=<conversationId>`)

**Checkpoint**: quickstart steps 4 and 6 pass; US1 still passes.

---

## Phase 5: User Story 3 - Criar funis e montar as etapas do pipeline (Priority: P1)

**Goal**: admins create, rename, archive/reactivate pipelines, choose the entry pipeline, and build
stages (add, rename, color, kind, drag to reorder, delete with lead relocation). Attendants see no
structure controls.

**Independent Test**: create "Pós-venda", add "Onboarding", drag it to position 2, turn "Perdido"
into "Cancelado" (lost, red); the board shows exactly that (quickstart steps 3, 8 and 9).

### Tests for User Story 3 ⚠️

- [X] T050 [P] [US3] Write tests in `backend/src/models/pipeline.test.ts` for writes: `create(db, name)` trims, 1–60 chars, inserts `DEFAULT_STAGES` in order; duplicate active name (case-insensitive) → `conflict('PIPELINE_NAME_TAKEN')`; a name equal to an archived pipeline is allowed; `update(db, id, { name, isEntry, archived })`: setting `isEntry` clears the previous entry pipeline in the same transaction; `isEntry` on an archived pipeline → `conflict('PIPELINE_ARCHIVED')`; archiving sets `archived_at` and clears `is_entry`; reactivating fails with `PIPELINE_NAME_TAKEN` when an active pipeline has the same name
- [X] T051 [P] [US3] Write tests in `backend/src/models/stage.test.ts`: `create` appends at the end, name 1–40 chars trimmed and unique per pipeline (`STAGE_NAME_TAKEN`), `STAGE_LIMIT` 20 → `conflict('STAGE_LIMIT')`; `update` name/color/kind; `reorder(db, pipelineId, stageIds)` rewrites positions 0..n−1 and rejects a list that is not exactly the pipeline's stages (`DomainError('STAGE_ORDER_MISMATCH', …, 422)`); `remove(db, { stageId, moveToStageId, userId })`: empty stage deleted; last stage → `conflict('LAST_STAGE')`; non-empty without `moveToStageId` → `conflict('STAGE_NOT_EMPTY')`; `moveToStageId` equal to the stage or from another pipeline → 422; leads relocated to the end of the destination keeping their order, `stage_entered_at` updated, one history row per lead with `changed_by_id = userId`, and existing history rows keep their stage names after deletion; returns the relocated lead ids
- [X] T052 [P] [US3] Write tests in `backend/src/controllers/pipelines.test.ts` (models mocked): `createPipeline`, `updatePipeline`, `createStage`, `updateStage`, `reorderStages`, `deleteStage` each publish `pipeline.changed { pipelineId }`; `deleteStage` also publishes `lead.upserted` for every relocated lead; 404 for unknown pipeline/stage and for a stage of another pipeline
- [X] T053 [P] [US3] Write route tests in `backend/src/routes/pipelines.test.ts`: every structure route (`POST /api/pipelines`, `PATCH /api/pipelines/:id`, `POST|PATCH|DELETE /api/pipelines/:id/stages…`, `PUT /api/pipelines/:id/stages/order`) returns 403 for an attendant and succeeds for an admin; validation 422 for names out of range, invalid color/kind and empty `stageIds`; `DELETE` with `moveToStageId` relocates leads
- [X] T054 [P] [US3] Write tests in `frontend/src/components/pipeline/stage-editor.test.tsx`: lists stages in order with color and kind; add stage (validation 1–40, `STAGE_LIMIT` message); rename inline; change color (8 swatches with accessible names) and kind (Aberta / Ganho / Perdido); keyboard reorder (Space, ArrowDown, Space) sends `PUT /stages/order` with the new id list; delete of an empty stage asks for confirmation; delete of a stage with leads requires choosing a destination stage; server errors shown in pt-BR
- [X] T055 [P] [US3] Write tests for the pipelines list in `frontend/src/app/(painel)/funis/page.test.tsx`: admin sees "Novo funil" (name 1–60, `PIPELINE_NAME_TAKEN` message), "Funil de entrada" toggle, rename, archive/reactivate and "Arquivados" filter; attendant sees none of these controls, and the board page hides "Editar etapas"

### Implementation for User Story 3

- [X] T056 [US3] Implement `create` and `update` in `backend/src/models/pipeline.ts` (export `DEFAULT_STAGES`)
- [X] T057 [US3] Implement `backend/src/models/stage.ts` (`create`, `update`, `reorder`, `remove`, export `STAGE_LIMIT`)
- [X] T058 [US3] Implement `createPipeline`, `updatePipeline`, `createStage`, `updateStage`, `reorderStages`, `deleteStage` in `backend/src/controllers/pipelines.ts`
- [X] T059 [US3] Add the structure routes to `backend/src/routes/pipelines.ts` with `requireAdmin` and Zod schemas per contracts/openapi.yaml
- [X] T060 [US3] Add mutations `useCreatePipeline`, `useUpdatePipeline`, `useCreateStage`, `useUpdateStage`, `useReorderStages` (optimistic order), `useDeleteStage` to `frontend/src/lib/use-pipelines.ts`
- [X] T061 [US3] Implement `StageEditor` in `frontend/src/components/pipeline/stage-editor.tsx` (`SortableContext` vertical, keyboard sensor, color swatches from the stage tokens, kind select, delete dialog with destination select) and the page `frontend/src/app/(painel)/funis/[pipelineId]/etapas/page.tsx` (admin only; non-admins redirected to the board)
- [X] T062 [US3] Add admin controls to `frontend/src/app/(painel)/funis/page.tsx` (create, rename, entry toggle, archive/reactivate, "Arquivados" filter) and an "Editar etapas" link on the board page for admins

**Checkpoint**: quickstart steps 3, 8 and 9 pass; US1 and US2 still pass.

---

## Phase 6: User Story 4 - Detalhes, responsável e histórico do lead (Priority: P2)

**Goal**: lead panel with editable title, value, assignee and notes, stage history, lead deletion,
board filters ("Meus leads", "Sem responsável", by user) and search.

**Independent Test**: set value R$ 5.000 and assignee "Bia", move twice, see both changes with
author and time in the history; as Bia, "Meus leads" shows only hers (quickstart step 7).

### Tests for User Story 4 ⚠️

- [X] T063 [P] [US4] Write tests in `backend/src/models/lead.test.ts` for `update(db, id, patch)` (`title` ≤ 120 chars, `valueCents` integer ≥ 0 or null, `notes` ≤ 5,000 chars, `assigneeId` null or user id), `history(db, leadId)` newest first with author names (null author = automatic) and `remove(db, id)` (cascades history; contact and conversation untouched)
- [X] T064 [P] [US4] Write tests in `backend/src/controllers/leads.test.ts` for `getLead` (404), `updateLead` (assignee must be an `active` user → `DomainError('ASSIGNEE_INVALID', …, 422)`; publishes `lead.upserted`) and `deleteLead` (publishes `lead.deleted` with `pipelineId`, `stageId`, `contactId`)
- [X] T065 [P] [US4] Write route tests in `backend/src/routes/leads.test.ts` for `GET /api/leads/:id` (LeadDetail with history), `PATCH /api/leads/:id` (422 on `valueCents: -1`, empty body, notes over 5,000 chars) and `DELETE /api/leads/:id` 204; and `GET /api/pipelines/:id/board?assignee=me&search=…` filtering counts and cards
- [X] T066 [P] [US4] Write tests in `frontend/src/components/pipeline/lead-panel.test.tsx`: opens from `?lead=<id>`; edits title, value (typed as "5.000,00" → `valueCents: 500000`), assignee (from `/api/users/assignable`, plus "Sem responsável") and notes, saving PATCHes only changed fields; shows lost reason for leads in a `lost` stage; history list newest first with "automático" for null author; "Excluir lead" confirms, DELETEs and closes; "Abrir conversa" link present
- [X] T067 [P] [US4] Write tests in `frontend/src/components/pipeline/board-filters.test.tsx`: "Meus leads", "Sem responsável" and user select update the URL (`?assignee=`) and the board query; search input debounced 300 ms (`?q=`); clearing filters restores all cards

### Implementation for User Story 4

- [X] T068 [US4] Implement `update`, `history` and `remove` in `backend/src/models/lead.ts`
- [X] T069 [US4] Implement `getLead`, `updateLead` and `deleteLead` in `backend/src/controllers/leads.ts`
- [X] T070 [US4] Add `GET`, `PATCH` and `DELETE /api/leads/:leadId` to `backend/src/routes/leads.ts` with Zod schemas per contracts/openapi.yaml
- [X] T071 [US4] Add `useLead(id)`, `useUpdateLead()` and `useDeleteLead()` to `frontend/src/lib/use-pipelines.ts`
- [X] T072 [P] [US4] Implement `LeadPanel` in `frontend/src/components/pipeline/lead-panel.tsx` (side panel on desktop, full screen below 768 px; closes with Escape and removes `?lead=`)
- [X] T073 [P] [US4] Implement `BoardFilters` in `frontend/src/components/pipeline/board-filters.tsx` (reuse the debounce approach of `components/chat/conversation-search.tsx`)
- [X] T074 [US4] Wire `LeadPanel` and `BoardFilters` into `frontend/src/app/(painel)/funis/[pipelineId]/page.tsx` (filters read from and written to the URL; board query keyed by them)

**Checkpoint**: quickstart step 7 passes; all stories pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T075 [P] Run `npm run test:coverage` and add tests until `backend/src/models/**` and `backend/src/controllers/**` stay ≥ 80% lines
- [X] T076 [P] Security review: every new route has `requireAuth` or `requireAdmin` as in contracts; all bodies/queries/params validated with Zod; RLS present for the 4 new tables in the migration; no new env var reaches the frontend
- [ ] T077 [P] Visual review of `/funis`, the board, the stage editor, the lead panel and the chat lead strip at 375, 768 and 1280 px against the V4 brand (no horizontal page scroll outside the board's own column scroller; focus visible; `prefers-reduced-motion` disables the drag animation)
- [X] T078 [P] Update `CLAUDE.md`: pipelines/leads in the architecture section (models `pipeline`/`stage`/`lead`, lead entry in `messages.receive`, SSE events `lead.*`/`pipeline.changed`, query keys `['board', …]`, `['leads', 'contact', …]`) and `npm run db:seed:pipelines -w backend` in commands
- [ ] T079 Run every step of `specs/002-sales-pipelines/quickstart.md` against the local stack and fix failures (steps needing a phone can use the webhook simulation from step 4)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories → **Polish (Phase 7)**
- Foundational blocks everything (schema, migration with the "Vendas" seed, DTOs, event types,
  shared frontend types and tokens).

### User Story Dependencies

- **US1 (board)**: after Foundational. Leads for testing come from the seed script T034, so it
  does not need US2.
- **US2 (WhatsApp → lead)**: after Foundational. Reuses `lead.move` (T024) for the stage select and
  `LostReasonDialog` (T030); if built before US1, do T024 and T030 first.
- **US3 (pipeline builder)**: after Foundational. Independent of US1/US2 in the backend; the
  "Editar etapas" link (T062) lands on the board page from T033.
- **US4 (details, history, filters)**: after US1 (extends the board page, card and lead model).

### Within Each Story

- Tests first (must fail) → models → controllers → routes → frontend hooks → components → page
  wiring.

### Parallel Opportunities

- Setup: T001 and T002 in parallel.
- Foundational: T005, T007, T008, T009 in parallel after T003–T004 (T010 after T006); T011–T014 in parallel
  with the backend work.
- US1: tests T016–T022 in parallel; T027, T030, T031 in parallel with backend T023–T026.
- US2: tests T035–T041 in parallel; T043 parallel with T042.
- US3: tests T050–T055 in parallel; T056 and T057 in parallel.
- US4: tests T063–T067 in parallel; T072 and T073 in parallel.
- US1 and US3 can be built by different people in parallel once Foundational is done.

---

## Parallel Example: User Story 1

```bash
# Tests first, all together:
Task: "Board read tests in backend/src/models/lead.test.ts"
Task: "Leads controller tests in backend/src/controllers/leads.test.ts"
Task: "Pure cache helper tests in frontend/src/lib/pipeline-cache.test.ts"
Task: "Board component tests in frontend/src/components/pipeline/board.test.tsx"

# Frontend pieces alongside the backend model/controller work:
Task: "Implement pipeline-cache helpers in frontend/src/lib/pipeline-cache.ts"
Task: "Implement LostReasonDialog in frontend/src/components/pipeline/lost-reason-dialog.tsx"
Task: "Implement LeadCard in frontend/src/components/pipeline/lead-card.tsx"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → Phase 2 Foundational ("Vendas" exists, `GET /api/pipelines` works)
2. Phase 3 US1 (board with drag, keyboard, "Mover para", realtime) using seeded leads
3. **STOP and VALIDATE** with quickstart steps 5 and 10.

### Incremental Delivery

1. + US2 → leads come from WhatsApp and the chat shows/changes the stage (steps 4, 6)
2. + US3 → admins build their own pipelines (steps 3, 8, 9)
3. + US4 → lead details, history and filters (step 7)
4. Polish → coverage, security review, visual review, full quickstart run

---

## Notes

- [P] = different files, no dependencies on incomplete tasks
- Tests must fail before implementation (constitution III)
- `backend/src/models/lead.test.ts`, `backend/src/controllers/leads.test.ts` and
  `backend/src/routes/leads.test.ts` are extended by several stories; add a `describe` block per
  story to avoid edit conflicts
- Specs 003 and 004 are being specified in parallel and will add their own migrations; regenerate
  or renumber the migration in T004 if another one lands first

---

## Implementation notes (deviations from the tasks above)

- **Keyboard moves** (T021, T032, T054): cards and stage rows move with **Alt + arrow keys** handled
  by the components, instead of dnd-kit's Space/arrow KeyboardSensor. jsdom has no layout, so the
  sensor cannot be tested reliably, and our own handler is deterministic and announced via
  `aria-live`. Each card also has a "Mover" select.
- **`/funis`** (T033) lists the pipelines instead of redirecting to the entry pipeline, because it is
  also where admins manage pipelines (US3).
- **First-contact check** (T036, T043) is `hasOtherInbound` (any other inbound message in the
  conversation), which also covers out-of-order webhooks.
- **SSE payloads**: `lead.upserted` carries `previous: { stageId, valueCents } | null` and
  `lead.deleted` carries `valueCents`, so column totals stay exact without refetching and an
  optimistic move is not counted twice (contracts/sse-events.md updated).
- Invalid destination when deleting a stage returns `INVALID_MOVE_TARGET` (422).
- `@dnd-kit/utilities` added explicitly (CSS transform helper, same package family as T001).
- `isUniqueViolation` moved from `models/user.ts` to `lib/db-errors.ts` for reuse.
- Mobile panel nav now scrolls horizontally so "Sair" stays visible with the new "Funis" link.

## Open

- **T077**: board and pipeline list reviewed at 375/768/1280 px (no page overflow after fixing
  off-screen `sr-only` text). The lead panel, stage editor and chat lead strip still need a visual
  pass: the local test accounts were disabled during implementation, so no session was available.
- **T079**: quickstart steps 1–2, 4 (webhook simulation, covered by route tests) and 10 (board with
  2,000 leads in 17–53 ms) were validated; steps 3 and 5–9 need a logged-in person in the browser.
