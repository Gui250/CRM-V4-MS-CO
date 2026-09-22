---

description: "Task list for Relatórios de BI Interativos"
---

# Tasks: Relatórios de BI Interativos

**Input**: Design documents from `specs/004-interactive-bi-reports/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED. Constitution Princípio III: every model, controller and connector gets a
`*.test.ts` next to it; frontend components with logic get Testing Library tests. Write each
story's tests first and confirm they fail before implementing.

**Organization**: Tasks grouped by user story (US1–US5 from spec.md). The query compiler, BI
schema and internal sources are Foundational because every story renders data through them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5 from spec.md
- Paths: `backend/src/`, `frontend/src/`. Tests live next to the code.

## Conventions for every task

- Backend layering (constitution I, CLAUDE.md): `routes/` validate with Zod and call
  `controllers/`; controllers take `AppContext` first and never import `db/`; models take `db`
  first and are the only code that runs SQL; external connectors live in
  `integrations/bi-connectors/`.
- Model tests use `createTestDb()` (`backend/src/test/db.ts`); controller tests `vi.mock` models and
  use `fakeContext()` (`backend/src/test/context.ts`); route tests use `buildTestApp()` +
  `app.inject`. Frontend: `renderWithClient` + `mockApi` (`frontend/src/test/render.tsx`); mock
  `echarts` with `vi.mock('echarts/core')` in component tests.
- API field names are camelCase exactly as in `contracts/openapi.yaml`; responses shaped in
  `backend/src/controllers/dto.ts`. Errors: `DomainError(code, message, status)` with the codes
  listed in the contract; messages pt-BR.
- Named constants (no magic numbers) in `backend/src/models/bi/limits.ts`:
  `MAX_SPREADSHEET_BYTES = 50 * 1024 * 1024`, `MAX_SOURCE_ROWS = 500_000`,
  `QUERY_TIMEOUT_MS = 30_000`, `MAX_API_PAGES = 50`, `MAX_API_PAGE_BYTES = 20 * 1024 * 1024`,
  `PREVIEW_ROWS = 50`, `DEFAULT_VISUAL_LIMIT = 20`, `ROWS_PAGE_SIZE = 100`,
  `INGEST_BATCH_ROWS = 1_000`, `TYPE_SAMPLE_ROWS = 1_000`, `UNDO_HISTORY = 20`.
- Any simplification with a known ceiling carries a `ponytail:` comment naming the ceiling and the
  upgrade path (e.g. jsonb snapshots, research §1; DNS rebinding window, research §6).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencies, env vars and local infra for BI

- [X] T001 Add backend dependencies `mysql2`, `exceljs`, `csv-parse` to `backend/package.json` (`npm install -w backend mysql2 exceljs csv-parse`)
- [X] T002 [P] Add frontend dependencies `react-grid-layout@^2`, `echarts@^6`, `html-to-image` to `frontend/package.json` (`npm install -w frontend react-grid-layout echarts html-to-image`); import `react-grid-layout/css/styles.css` and `react-resizable/css/styles.css` in `frontend/src/app/(painel)/relatorios/layout.tsx` only
- [X] T003 [P] Add `BI_SECRETS_KEY` (base64 of 32 random bytes; generate with `openssl rand -base64 32`) and `BI_ALLOW_PRIVATE_NETWORKS=true` (with comment "false em produção") to `.env.example`
- [X] T004 [P] Add optional `mysql:8` service under `profiles: ["bi"]` to `docker-compose.yml` (port `${MYSQL_PORT:-3306}:3306`, `MYSQL_ROOT_PASSWORD: mysql`, `MYSQL_DATABASE: bi_test`, init script `docker/mysql-init.sql` creating table `vendas (id int primary key auto_increment, data date, vendedor varchar(100), valor decimal(12,2))` with ~50 sample rows and a read-only user `leitor`/`leitor` with `GRANT SELECT ON bi_test.*`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: config, schema, report definition, internal sources, query compiler, query API and
frontend plumbing. Every story depends on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Backend core

- [X] T005 Extend env config in `backend/src/config.ts`: `BI_SECRETS_KEY` (string, base64 that decodes to exactly 32 bytes, refine with message "precisa ter 32 bytes em base64") and `BI_ALLOW_PRIVATE_NETWORKS` (reuse `booleanFromString`, default `false`); add both to `testConfig` in `backend/src/test/context.ts` (`BI_SECRETS_KEY` = base64 of 32 zero bytes, `BI_ALLOW_PRIVATE_NETWORKS: false`); extend `backend/src/config.test.ts` (or create it) with valid/invalid key cases
- [X] T006 [P] Create limit constants in `backend/src/models/bi/limits.ts` (values listed in "Conventions")
- [X] T007 Add BI tables to `backend/src/db/schema.ts` exactly per data-model.md: enums `bi_source_kind (spreadsheet_file, spreadsheet_url, postgres, mysql, api)`, `bi_refresh_interval (manual, 15m, 1h, 6h, 24h)`, `bi_snapshot_status (running, succeeded, failed)`, `bi_share_permission (edit, view)`; tables `bi_sources` (`name citext unique`, `kind`, `config jsonb not null`, `secrets_encrypted text null`, `fields jsonb not null default '[]'`, `refresh_interval default 'manual'`, `next_refresh_at timestamptz null` with partial index `WHERE next_refresh_at IS NOT NULL`, `current_snapshot_id uuid null`, `last_attempt_at`, `last_error text null`, `created_by uuid references users on delete set null`, timestamps), `bi_snapshots` (`source_id` cascade, `status`, `row_count integer not null default 0 check (row_count >= 0)`, `started_at`, `finished_at null`, `error null`; unique partial index `(source_id) WHERE status = 'running'`), `bi_snapshot_rows` (`snapshot_id` cascade, `row_num integer`, `data jsonb not null`, PK `(snapshot_id, row_num)`), `bi_relationships` (`left_source_id text`, `left_field text`, `right_source_id text`, `right_field text`, `created_at`; check `left_source_id <> right_source_id`; unique index on `(least(left_source_id, right_source_id), greatest(...), ...)` via expression index in SQL), `reports` (`name text` 1–100 check, `owner_id` cascade, `definition jsonb not null`, `version integer not null default 1`, timestamps), `report_shares` (`report_id` cascade, `user_id` cascade, `permission`, `created_at`, PK `(report_id, user_id)`); `bi_sources.current_snapshot_id` FK → `bi_snapshots.id` `ON DELETE SET NULL`; export row types
- [X] T008 Generate migration `backend/src/db/migrations/0001_bi.sql` with `npm run db:generate -w backend`, then append `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;` for `bi_sources`, `bi_snapshots`, `bi_snapshot_rows`, `bi_relationships`, `reports`, `report_shares` and the relationship pair unique expression index if drizzle-kit could not express it; run `npm test -w backend -- src/models` to confirm `createTestDb()` still migrates
- [X] T009 [P] Write tests for `backend/src/models/bi/definition.test.ts`: accepts a full valid `ReportDefinition` (pages 1–20, visuals ≤ 30 per page, calculatedFields ≤ 50, layout `w 1–12`, `h 1–20`, title ≤ 100, text ≤ 2.000, limit 1–1000 default 20, crossFilter default true); rejects unknown visual type, 0 pages, visual without `sourceId` unless `type = 'text'`, slot counts outside the table in contracts/report-definition.md (e.g. pie with 2 values, legend with 2 values on bar)
- [X] T010 [P] Implement Zod `ReportDefinition` in `backend/src/models/bi/definition.ts` per data-model.md and the slot table in contracts/report-definition.md (export `reportDefinitionSchema`, types `ReportDefinition`, `Visual`, `FieldRef`, `MeasureRef`, `Filter`, `CalculatedField`, `FieldType`, and `emptyDefinition()` returning one page "Página 1")
- [X] T011 [P] Write tests for `backend/src/models/bi/internal-sources.test.ts` against `createTestDb()` with a few seeded contacts/conversations/messages/users: `listInternalSources()` returns `internal:whatsapp_conversations` and `internal:whatsapp_messages` with typed fields; running each dataset SQL returns the expected rows; `atendente` is the sender's user name for outbound and `"Contato"` for inbound; direction exposed as `Recebida`/`Enviada`
- [X] T012 [P] Implement `backend/src/models/bi/internal-sources.ts`: constant definitions `{ id, name, fields: SourceField[], dataset: SQL }` for the two sources in data-model.md § Fontes internas (conversations: conversa, contato, telefone, criada_em, ultima_mensagem_em, nao_lidas, total_mensagens, recebidas, enviadas; messages: mensagem, conversa, contato, telefone, direcao, tipo, situacao, enviada_em, atendente); pt-BR labels
- [X] T013 Write tests for `backend/src/models/bi/query-compiler.test.ts`, executing compiled SQL against `createTestDb()` (seed a fake external snapshot in `bi_snapshot_rows` plus internal data): count/sum/avg/min/max/count_distinct; date grains day/week/month/quarter/year in `America/Sao_Paulo` (a message at 2026-01-01 01:00 UTC lands on 2025-12-31); filters `in`, `not_in`, `between`, `gte`, `lte`, `is_null`, `not_null`; Top N + "Outros" keeps correct `avg` for the grouped rest; sort by value/category; unknown field → `DomainError('UNKNOWN_FIELD', …, 422)`; field names with quotes/SQL (`"x'); drop table users; --"`) never reach SQL text (assert parameterized and table still exists); `ignoredRows` counts rows whose used measure field is null in the snapshot but had `invalidCount` > 0; 2 dimensions produce rows `[d1, d2, m]`
- [X] T014 Implement `backend/src/models/bi/query-compiler.ts`: `compileQuery(dataset: { fields: SourceField[]; sql: SQL }, request: QueryRequest) → SQL` using Drizzle `sql` fragments only; field references resolved by key from the allowlist (external snapshot fields as `(data->>${key})::<type>` with the key as a bound parameter; internal as `sql.identifier`); `date_trunc(${grain}, x AT TIME ZONE 'America/Sao_Paulo')`; Top N + "Outros" with CTE (research §2); `SET LOCAL statement_timeout` inside the transaction that runs it; plus `runQuery(db, datasetFor(sourceId), request)` returning `{ columns, rows }`
- [X] T015 Implement `datasetFor(db, sourceId)` in `backend/src/models/bi/dataset.ts` (internal id → internal definition; uuid → `bi_sources` row + current snapshot `SELECT data FROM bi_snapshot_rows WHERE snapshot_id = $1`; unknown or no snapshot → `notFound('Fonte não encontrada.')` with code `SOURCE_NOT_FOUND`) and test it in `backend/src/models/bi/dataset.test.ts`
- [X] T016 Write tests for `backend/src/controllers/bi-query.test.ts` (models mocked): `query` validates the request against the source fields, returns `dataAsOf` (now for internal, snapshot `finished_at` for external), `staleWarning` `"dados de dd/mm/aaaa hh:mm; última atualização falhou"` when the source has `last_error`, `missingFields` when a requested field no longer exists (returns empty rows instead of throwing); timeout from Postgres (`57014`) → `DomainError('QUERY_TIMEOUT', 'A consulta demorou demais…', 504)`
- [X] T017 Implement `backend/src/controllers/bi-query.ts` (`runVisualQuery(ctx, user, request)`) and `listSources(ctx)` in `backend/src/controllers/bi-sources.ts` returning internal sources (external added in US4); add `toSourceDto`, `toQueryResultDto` in `backend/src/controllers/dto.ts`
- [X] T018 Implement routes in `backend/src/routes/bi-query.ts` (`POST /api/bi/query`, Zod schema mirroring `QueryRequest` in contracts/openapi.yaml, `requireAuth`) and `backend/src/routes/bi-sources.ts` (`GET /api/bi/sources`, `requireAuth`); register both in `backend/src/app.ts`; route tests in `backend/src/routes/bi-query.test.ts` with a real `createTestDb()` (401 without session, 422 on invalid body, 200 with rows)

### Frontend core

- [X] T019 [P] Add BI types in `frontend/src/lib/bi/types.ts` mirroring `ReportDefinition`, `Source`, `Field`, `QueryRequest`, `QueryResult`, `Report`, `ReportSummary`, `Share` from contracts
- [X] T020 [P] Add pt-BR formatters to `frontend/src/lib/format.ts`: `formatNumber(value, 'integer'|'decimal'|'currency'|'percent')` via `Intl.NumberFormat('pt-BR')` (`R$ 1.234,56`), `formatBucket(iso, grain)` (dia `dd/mm/aaaa`, semana `sem. dd/mm`, mês `jan/2026`, trimestre `T1/2026`, ano `2026`) in `America/Sao_Paulo`; tests in `frontend/src/lib/format.test.ts`
- [X] T021 [P] Implement hooks in `frontend/src/lib/bi/use-bi.ts`: `useSources()`, `useSource(id)`, `useVisualQuery(request)` (query key `['bi-query', request]`, `enabled` only when the request has a source and at least one field, `placeholderData: keepPreviousData`), `useReports()`, `useReport(id)` using `apiFetch`
- [X] T022 [P] Add "Relatórios" (`/relatorios`) and "Fontes de dados" (`/fontes`, `adminOnly`) to `LINKS` in `frontend/src/components/panel-nav.tsx`; update its test if present
- [X] T023 [P] Implement ECharts wrapper `frontend/src/components/bi/visuals/echart.tsx` (~40 lines: `echarts/core` modular imports for Bar, Line, Pie, Funnel + Grid, Tooltip, Legend, Aria components + SVGRenderer; init on mount, `setOption(option, true)` on change, `resize` via `ResizeObserver`, dispose on unmount; `onItemClick(params)` prop; `aria.enabled: true`) and theme tokens from `globals.css` brand colors in `frontend/src/lib/bi/chart-theme.ts`; extend `frontend/src/styles/contrast.test.ts` so the series palette keeps WCAG AA contrast (≥ 3:1 for graphics) against the panel background

**Checkpoint**: `POST /api/bi/query` answers for internal sources; frontend can call it.

---

## Phase 3: User Story 1 - Montar um relatório arrastando componentes sobre os dados do CRM (Priority: P1) 🎯 MVP

**Goal**: create, edit (drag components, drop fields into slots, move/resize), save and reopen a
report over internal WhatsApp data.

**Independent Test**: quickstart.md §2 steps 1–4 and 7: relatório "Atendimento" com cartão,
colunas por dia e tabela por atendente; salvar, recarregar, mesmo layout e números.

### Tests for User Story 1 ⚠️

- [X] T024 [P] [US1] Write tests for report model in `backend/src/models/bi/report.test.ts`: `createReport(db, { name, ownerId, definition })` with `version = 1`; `name` "1–100" enforced; `getReport`; `listReportsForUser(db, user)` returns own reports (admin: all) ordered by `updated_at desc` with `ownerName`; `saveReport(db, id, { name, definition, expectedVersion })` increments `version`; `deleteReport`
- [X] T025 [P] [US1] Write tests for `backend/src/models/bi/access.test.ts`: `reportPermission(db, user, reportId)` returns `owner` for owner, `edit` for admin on others' reports, `null` for others (shares added in US5)
- [X] T026 [P] [US1] Write tests for `backend/src/models/bi/expression.test.ts`: parses `[Valor] * 2`, `([A] + [B]) / [C]`, `SUM([Valor]) / COUNT([Lead])`; division emits `NULLIF(…, 0)`; rejects unknown field, unbalanced parentheses, unknown function, mixed row/aggregate without aggregation (`[A] + SUM([B])`), expressions > 500 chars → `DomainError('INVALID_EXPRESSION', …, 422)` with position in message; compiled SQL executes on `createTestDb()` and field names are bound parameters
- [X] T027 [P] [US1] Write tests for `backend/src/controllers/bi-reports.test.ts` (models mocked): create empty report gets `emptyDefinition()`; get without permission → 404 (do not leak existence); save validates definition with `reportDefinitionSchema` and that every `sourceId` exists and every field exists in its source (or is a calculated field) → 422 `UNKNOWN_FIELD`/`INVALID_EXPRESSION`; only `owner`/`edit` can save or delete (`forbidden`)
- [X] T028 [P] [US1] Write tests for `frontend/src/lib/bi/editor-reducer.test.ts`: actions `addVisual`, `removeVisual`, `moveResize(layouts)`, `dropField(visualId, slot, fieldRef)` (default aggregation `sum` for number/currency else `count`; default grain `month`), `setAggregation`, `setDateGrain`, `setOption(title|sort|limit|numberFormat)`, `changeType` (keeps compatible slots, excess into `pendingFields`), `addCalculatedField`; `undo`/`redo` over the last 20 actions (21st pushes oldest out); `isDirty` true after change, false after `markSaved(version)`
- [X] T029 [P] [US1] Write tests for `frontend/src/lib/bi/slots.test.ts`: slot rules per type match contracts/report-definition.md table; `acceptsField(visualType, slot, field)` (e.g. `filter_date` accepts only date/datetime)
- [X] T030 [P] [US1] Write tests for `frontend/src/lib/bi/build-query.test.ts` (no filters yet): category → dimensions, value → measures, legend → second dimension, pivot rows+columns, `limit`/`sort`/`groupOthers` from options, calculated fields copied
- [X] T031 [P] [US1] Write tests for `frontend/src/components/bi/report-editor.test.tsx`: renders palette, empty canvas and field list for the chosen source; adding a column chart via the palette menu (keyboard) and "Adicionar a → Categoria/Valor" on fields calls `/api/bi/query` and renders; Save sends `PUT` with `version`; leaving with unsaved changes asks for confirmation (`beforeunload` + in-app link guard); Ctrl+Z/Ctrl+Shift+Z undo/redo; arrow keys move and Shift+arrow resize the selected visual in the layout
- [X] T032 [P] [US1] Write tests for `frontend/src/components/bi/visual-frame.test.tsx`: loading, error, "sem dados para os filtros atuais", `missingFields` warning ("O campo X não existe mais na fonte"), ignored-rows note, and fields incompatible after type change flagged

### Implementation for User Story 1

- [X] T033 [P] [US1] Implement `backend/src/models/bi/report.ts` (functions from T024; `saveReport` updates `WHERE id = $1 AND version = $expectedVersion`, returns `null` when no row matched)
- [X] T034 [P] [US1] Implement `backend/src/models/bi/access.ts` (`reportPermission`, `canEdit(permission)`)
- [X] T035 [P] [US1] Implement `backend/src/models/bi/expression.ts` (recursive-descent parser → Drizzle `sql`, grammar in research §3) and wire calculated fields into `compileQuery` (row expressions as columns; aggregate expressions as measures)
- [X] T036 [US1] Implement `backend/src/controllers/bi-reports.ts`: `createReport(ctx, user, { name })`, `getReport`, `listReports`, `saveReport` (definition validation + field existence using `datasetFor` fields), `deleteReport`; add `toReportDto`, `toReportSummaryDto` in `dto.ts`
- [X] T037 [US1] Implement routes in `backend/src/routes/bi-reports.ts`: `GET/POST /api/bi/reports`, `GET/PUT/DELETE /api/bi/reports/:reportId` per contracts/openapi.yaml (no `force`/conflict yet: stale version returns 409 `REPORT_CONFLICT` without details); register in `app.ts`; route test `backend/src/routes/bi-reports.test.ts` (create → get → put → get shows new version)
- [X] T038 [P] [US1] Implement `frontend/src/lib/bi/slots.ts` and `frontend/src/lib/bi/build-query.ts`
- [X] T039 [P] [US1] Implement `frontend/src/lib/bi/editor-reducer.ts` (`useReducer` state `{ definition, selectedVisualId, pageId, history: { past, future }, savedVersion, isDirty }`)
- [X] T040 [P] [US1] Implement `frontend/src/lib/bi/echarts-options.ts`: `QueryResult` + visual → ECharts `option` for bar (horizontal), column, line, area, pie, donut, funnel; axis labels via `formatBucket`/`formatNumber`; tooltip formatter with exact formatted value (FR-017); tests in `frontend/src/lib/bi/echarts-options.test.ts`
- [X] T041 [P] [US1] Implement visuals in `frontend/src/components/bi/visuals/`: `chart-visual.tsx` (uses `echart.tsx` + `echarts-options`), `kpi-visual.tsx` (big number + label), `table-visual.tsx` (`<table>` with sortable headers), `pivot-visual.tsx` (pivot client-side from 2-dimension result, ≤ 50 columns, row/column totals), `text-visual.tsx`; tests for pivot and table in `frontend/src/components/bi/visuals/pivot-visual.test.tsx`
- [X] T042 [US1] Implement `frontend/src/components/bi/visual-frame.tsx` (title, menu: "Mudar tipo", "Remover", "Propriedades"; states from T032) and `frontend/src/components/bi/visual-renderer.tsx` (switch by `visual.type`, calls `useVisualQuery(buildQuery(...))`)
- [X] T043 [P] [US1] Implement `frontend/src/components/bi/field-list.tsx` (fields of the report source grouped by type icon; each field `draggable` with `dataTransfer` `application/x-bi-field`; menu "Adicionar a…" listing the selected visual's accepting slots) and `frontend/src/components/bi/slot-well.tsx` (drop target with `onDragOver`/`onDrop`, rejects incompatible types with message, remove chip, aggregation/grain dropdowns per chip)
- [X] T044 [P] [US1] Implement `frontend/src/components/bi/visual-palette.tsx` (one draggable button per visual type with `application/x-bi-visual`; Enter/click adds at the first free grid position)
- [X] T045 [US1] Implement `frontend/src/components/bi/report-canvas.tsx`: `react-grid-layout` `Responsive`/`GridLayout` 12 columns, `compactType="vertical"`, `preventCollision={false}`, `isDroppable` with `onDrop` creating a visual from palette data; selected visual responds to arrows (move 1 cell) and Shift+arrows (resize) by dispatching `moveResize`
- [X] T046 [US1] Implement `frontend/src/components/bi/visual-properties.tsx` (title, sort, limit, number format, cross-filter toggle placeholder for US3, calculated field editor with name + expression textarea and server-side error display)
- [X] T047 [US1] Implement `frontend/src/components/bi/report-editor.tsx` (three columns: palette | canvas | fields + properties; toolbar: name, source picker for new visuals, undo/redo, Save; unsaved-changes guard) and pages `frontend/src/app/(painel)/relatorios/page.tsx` (list from `useReports`, "Novo relatório" dialog asking name) and `frontend/src/app/(painel)/relatorios/[id]/page.tsx`
- [ ] T048 [US1] Verify US1 via quickstart.md §2 steps 1–4 and 7; numbers match the chat (SC-006)

**Checkpoint**: MVP: reports over internal data can be built, saved and reopened.

---

## Phase 4: User Story 2 - Componentes que se adaptam aos dados (Priority: P1)

**Goal**: field type recognition, suggested visual on field drop, "gerar relatório sugerido",
Top 20 + Outros, template "Atendimento WhatsApp".

**Independent Test**: over `internal:whatsapp_messages`, drop "Mensagem", "Enviada em" and
"Atendente" on the empty canvas → kpi, line, donut/bar; "Gerar relatório sugerido" → ≥ 4
coherent visuals. (With US4, repeat with the sales spreadsheet in quickstart.md §3.)

### Tests for User Story 2 ⚠️

- [X] T049 [P] [US2] Write tests for `backend/src/models/bi/type-inference.test.ts` (table-driven): `inferFieldType(samples)` over up to 1.000 samples with 95% threshold → `boolean` (`sim/não/true/false/s/n`), `number` (`1.234,56`, `1,234.56`, `42`, `-3,5`, `12%`), `currency` (≥ 80% with `R$`), `date` (`dd/mm/aaaa`, `aaaa-mm-dd`), `datetime` (`dd/mm/aaaa hh:mm`, ISO with time), `text` otherwise; empty samples ignored; `normalizeValue(raw, type)` returns number/ISO UTC (dates interpreted in `America/Sao_Paulo`)/boolean or `null` for invalid (`n/d`) and reports invalid
- [X] T050 [P] [US2] Write tests for `backend/src/models/bi/suggestions.test.ts`: `suggestVisualForField(field, distinctCount)` per the table in contracts/report-definition.md; `suggestPage(source, stats)` returns up to 2 kpis (first numeric fields), 1 line (first date field, value = first numeric or count), 1 ranking bar (text field with cardinality between 3 and 50, lowest first), laid out without overlap; falls back gracefully when the source has only text fields
- [X] T051 [P] [US2] Write tests for `backend/src/controllers/bi-query.test.ts` additions: `suggest(ctx, sourceId)` fetches distinct counts for text fields (one grouped query, capped at 51) and calls `suggestPage`; and for `backend/src/models/bi/templates.test.ts`: template `whatsapp_attendance` passes `reportDefinitionSchema` and every field exists in the internal sources
- [X] T052 [P] [US2] Write tests for `frontend/src/components/bi/report-canvas.test.tsx`: dropping a field (not a visual) on the canvas creates the suggested visual already filled; dropping a date field onto a column chart that has a number turns it into a line (contracts/report-definition.md rules); category with > 20 values shows "Outros" and limit can be changed in properties

### Implementation for User Story 2

- [X] T053 [P] [US2] Implement `backend/src/models/bi/type-inference.ts` (`inferFieldType`, `normalizeValue`, `buildFields(headers, sampleRows)` → `SourceField[]` with unique keys: duplicate headers get ` (2)`, empty headers become `Coluna N`)
- [X] T054 [P] [US2] Implement `backend/src/models/bi/suggestions.ts` and `backend/src/models/bi/templates.ts` (template "Atendimento WhatsApp": kpis total de mensagens and conversas, line mensagens por dia, bar mensagens por atendente, donut recebidas × enviadas, table conversas com mais não lidas)
- [X] T055 [US2] Add `suggest` to `backend/src/controllers/bi-query.ts`, route `POST /api/bi/suggest` in `backend/src/routes/bi-query.ts`; accept `templateId: 'whatsapp_attendance'` in `createReport` and route `POST /api/bi/reports`
- [X] T056 [US2] Mirror field-drop suggestions in `frontend/src/lib/bi/slots.ts` (`suggestVisualForField`, `mergeFieldIntoVisual`) and handle `application/x-bi-field` drops on the canvas in `frontend/src/components/bi/report-canvas.tsx` (distinct count from a `count` query with `limit: 7` before choosing donut vs bar)
- [X] T057 [US2] Add "Gerar relatório sugerido" to the empty-canvas state and toolbar in `frontend/src/components/bi/report-editor.tsx` (replaces the current empty page, undoable) and "Usar modelo" option in the new-report dialog in `frontend/src/app/(painel)/relatorios/page.tsx`
- [ ] T058 [US2] Verify US2 via the Independent Test above

**Checkpoint**: reports adapt to data and can be generated from a template or suggestion.

---

## Phase 5: User Story 3 - Interagir com o relatório: filtros e filtragem cruzada (Priority: P1)

**Goal**: page filters, cross-filter by click, date drill, tooltips, filter trail, "ver dados"
with CSV, read-only viewing that never changes the saved report.

**Independent Test**: quickstart.md §2 steps 5–6: click atendente "Ana" → daily chart shows only
her; drill year → month → day; clear filters restores totals.

### Tests for User Story 3 ⚠️

- [X] T059 [P] [US3] Write tests for `frontend/src/lib/bi/view-state.test.ts`: `toggleCrossFilter` (click same value clears; one at a time), `drillDown(visualId, grain, bucketStart)` pushes year → quarter → month → day and adds `between` filter of the bucket, `drillUp` pops, `overridePageFilter`, `clearAll`, `trailItems(state, definition)` lists each active item with a remove action
- [X] T060 [P] [US3] Extend `frontend/src/lib/bi/build-query.test.ts`: page filters + overrides + cross-filter + drill are merged; filters from another source are dropped unless a relationship links the two sources (relationships passed in; US4 fills them); the visual that originated the cross-filter is not filtered by it
- [X] T061 [P] [US3] Write tests for `backend/src/models/bi/rows.test.ts`: `listRows(db, dataset, { filters, page })` returns 100 rows per page with `total`; `streamRowsCsv` yields `﻿` BOM, `;` separator, quoted fields with `;`, `"` or newlines, pt-BR decimal comma, dates `dd/mm/aaaa hh:mm`, capped at 500.000 rows
- [X] T062 [P] [US3] Write tests for `frontend/src/components/bi/report-view.test.tsx`: `filter_list` (multi-select of distinct values from a `count` query) and `filter_date` (presets 7/30/90 dias, mês atual, ano atual, custom range with `<input type="date">`) update all visuals of the page; clicking a bar (simulate `onItemClick`) filters the others and highlights the bar; filter trail removes items one by one and "Limpar tudo"; a `view` user sees no editing controls and interactions never call `PUT`
- [X] T063 [P] [US3] Write tests for `frontend/src/components/bi/data-rows-dialog.test.tsx`: opens from visual menu "Ver dados", paginates, "Baixar planilha" posts to `/api/bi/rows.csv` with the same filters

### Implementation for User Story 3

- [X] T064 [P] [US3] Implement `frontend/src/lib/bi/view-state.ts` (reducer per page, never persisted) and extend `frontend/src/lib/bi/build-query.ts` with filter merging (T060)
- [X] T065 [P] [US3] Implement `backend/src/models/bi/rows.ts` (`listRows`, `streamRowsCsv` reusing the compiler's filter and field resolution)
- [X] T066 [US3] Add `rows` and `rowsCsv` to `backend/src/controllers/bi-query.ts` and routes `POST /api/bi/rows`, `POST /api/bi/rows.csv` (reply `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="dados-<fonte>-<aaaa-mm-dd>.csv"`, streamed) in `backend/src/routes/bi-query.ts`; route tests in `backend/src/routes/bi-query.test.ts`
- [X] T067 [P] [US3] Implement `frontend/src/components/bi/visuals/filter-list-visual.tsx` and `filter-date-visual.tsx`; editing mode writes the default into `page.filters`, view mode writes `pageFilterOverrides`
- [X] T068 [US3] Wire cross-filter and drill in `frontend/src/components/bi/visuals/chart-visual.tsx` (`onItemClick` → `toggleCrossFilter` when `options.crossFilter`; date category shows "Detalhar"/"Voltar nível" buttons; highlighted item via ECharts `emphasis`/`dispatchAction`) and the cross-filter toggle in `visual-properties.tsx` (FR-015)
- [X] T069 [P] [US3] Implement `frontend/src/components/bi/filter-trail.tsx` and `frontend/src/components/bi/data-rows-dialog.tsx` (native `<dialog>`)
- [X] T070 [US3] Implement `frontend/src/components/bi/report-view.tsx` (read-only grid with `isDraggable={false}`, filters, trail) and choose editor vs view in `frontend/src/app/(painel)/relatorios/[id]/page.tsx` by permission (`view` → view; `owner`/`edit` → editor with "Visualizar" toggle)
- [ ] T071 [US3] Verify US3 via quickstart.md §2 steps 5–6 and SC-002 timing on internal data

**Checkpoint**: P1 stories complete; reports are fully interactive over CRM data.

---

## Phase 6: User Story 4 - Conectar fontes externas: planilhas, bancos de dados e APIs (Priority: P2)

**Goal**: admins connect spreadsheet (file/link), PostgreSQL, MySQL and JSON APIs with test +
preview, scheduled refresh, stale-data warnings, type correction, relationships and delete guard.

**Independent Test**: quickstart.md §3 and §4.

### Tests for User Story 4 ⚠️

- [X] T072 [P] [US4] Write tests for `backend/src/lib/crypto.test.ts`: `encryptSecrets(obj, key)`/`decryptSecrets` round-trip (AES-256-GCM, random IV each call, format `iv.tag.ciphertext` base64); tampered ciphertext throws; `maskSecret('supersecret1234')` → `'••••1234'`, short values fully masked
- [X] T073 [P] [US4] Write tests for `backend/src/integrations/bi-connectors/network-guard.test.ts` (`dns.lookup` injected): rejects `127.0.0.1`, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.169.254`, `::1`, `fc00::/7`, `fe80::/10`, hostnames resolving to any of them → `DomainError('HOST_NOT_ALLOWED', …, 422)`; allows all when `allowPrivate`; `guardedFetch` follows up to 5 redirects re-checking each hop, rejects the 6th and any redirect to a private host
- [X] T074 [P] [US4] Write tests for `backend/src/integrations/bi-connectors/csv.test.ts` and `xlsx.test.ts` (fixture files in `backend/src/integrations/bi-connectors/fixtures/`): CSV with `;` and `,` autodetected, quoted newlines, UTF-8 BOM, header row N; XLSX lists sheets, reads chosen sheet and header row, dates as JS `Date`; both stop with `TOO_MANY_ROWS` after 500.000 rows
- [X] T075 [P] [US4] Write tests for `backend/src/integrations/bi-connectors/google-sheets.test.ts`: `https://docs.google.com/spreadsheets/d/<id>/edit#gid=123` → export URL `…/export?format=csv&gid=123`; non-Google host → `VALIDATION_ERROR`; 401/403 from Google → `DomainError('AUTH_FAILED', 'A planilha não está compartilhada por link…', 422)`
- [X] T076 [P] [US4] Write tests for `backend/src/integrations/bi-connectors/sql-guard.test.ts`: accepts single `SELECT`/`WITH … SELECT` (case-insensitive, leading comments/whitespace); rejects `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `COPY`, `CALL`, `SELECT … INTO`, `WITH … DELETE`, multiple statements (`;` outside quotes, trailing `;` allowed), > 10.000 chars → `QUERY_NOT_READ_ONLY`
- [X] T077 [P] [US4] Write tests for `backend/src/integrations/bi-connectors/postgres.test.ts` (inject a `postgres`-like client fake; one test against PGlite if feasible) and `mysql.test.ts` (`mysql2` mocked): opens read-only transaction, sets 30 s timeout, table mode builds `SELECT * FROM` with escaped identifiers, maps auth/connection/timeout errors to `AUTH_FAILED` / `CONNECTION_FAILED` / `TIMEOUT` with pt-BR messages, yields rows in batches
- [X] T078 [P] [US4] Write tests for `backend/src/integrations/bi-connectors/http-api.test.ts` (`fetch` mocked): GET/POST with headers + secret headers + query params; `itemsPath` `data.items` extraction, missing path → `ITEMS_PATH_NOT_FOUND`; nested objects flattened with `.` and arrays JSON-stringified; pagination by param up to `maxPages` (≤ 50), stops on empty page; response > 20 MB aborted; 30 s timeout → `TIMEOUT`; non-JSON → `CONNECTION_FAILED`
- [X] T079 [P] [US4] Write tests for `backend/src/models/bi/source.test.ts` and `snapshot.test.ts`: create/update/list/get sources (`name` citext unique → `conflict('SOURCE_NAME_TAKEN')`); `nextRefreshAt(interval, now)`; `claimDueSources(db, now)` uses `FOR UPDATE SKIP LOCKED` and skips sources with a `running` snapshot; `startSnapshot` fails when another is `running` (unique partial index → `conflict('REFRESH_IN_PROGRESS')`); `appendRows` in batches; `finishSnapshotSuccess` swaps `current_snapshot_id`, updates `fields`, clears `last_error`, deletes older snapshots in one transaction; `finishSnapshotFailure` keeps current snapshot and sets `last_error`; `reportsUsingSource(db, sourceId)` finds reports via `jsonb_path_exists`
- [X] T080 [P] [US4] Write tests for `backend/src/models/bi/relationship.test.ts`: create (both fields exist, types compatible text↔text/number↔number/date↔date else `INCOMPATIBLE_FIELDS`, same pair either order → `RELATIONSHIP_EXISTS`, same source rejected), list, delete, `relatedSources(db, sourceId)`; and compiler additions in `query-compiler.test.ts`: filter on related source becomes `IN (subquery)`; fields from related source via `LEFT JOIN`
- [X] T081 [P] [US4] Write tests for `backend/src/controllers/bi-sources.test.ts` (models and connectors mocked): `previewSource` returns ≤ 50 rows + fields without writing; `createSource` (admin only) validates `config` per kind (data-model.md § bi_sources: `spreadsheet_url` host `docs.google.com` https only, db `query` ≤ 10.000 chars, api `method GET|POST`, `pagination.maxPages ≤ 50`, `spreadsheet_file` refresh only `manual`), encrypts secrets, starts first refresh; `updateSource` with empty secret keeps the saved value, config or `fieldTypes` change triggers refresh; `deleteSource` blocked with `SOURCE_IN_USE` and `details.reports`; `refreshSource` normalizes values with the source field types, records `invalidCount` per field, fails with `TOO_MANY_ROWS` over 500.000, marks failure without touching current data; `runDueRefreshes` processes claimed sources one at a time; secrets never appear in DTOs (only `maskedSecrets`)
- [X] T082 [P] [US4] Write tests for `frontend/src/components/bi/source-form/source-form.test.tsx`: kind picker → spreadsheet (upload with progress, sheet and header row selectors), database (host/port/db/user/password/ssl, table or query, hint "use um usuário somente leitura"), API (url, method, headers with "secreto" checkbox, query params, body, items path, pagination); "Testar e ver prévia" shows preview table with detected types and invalid counts or the error message; type dropdown per field; saved secrets shown masked and left blank keeps them

### Implementation for User Story 4

- [X] T083 [P] [US4] Implement `backend/src/lib/crypto.ts` (`node:crypto` AES-256-GCM)
- [X] T084 [P] [US4] Implement `backend/src/integrations/bi-connectors/network-guard.ts` (`net.BlockList`, `dns.promises.lookup(host, { all: true })`, `guardedFetch` with `redirect: 'manual'`); add `// ponytail:` note on the DNS rebinding window (research §6)
- [X] T085 [P] [US4] Implement `backend/src/integrations/bi-connectors/csv.ts` (`csv-parse` streaming, delimiter sniffed from the first line) and `xlsx.ts` (`exceljs` `stream.xlsx.WorkbookReader`; `listSheets`)
- [X] T086 [P] [US4] Implement `backend/src/integrations/bi-connectors/google-sheets.ts` (URL rewrite + `guardedFetch` + csv reader)
- [X] T087 [P] [US4] Implement `backend/src/integrations/bi-connectors/sql-guard.ts`, `postgres.ts` (`postgres` driver, `begin('read only')`, `SET LOCAL statement_timeout`, cursor 1.000) and `mysql.ts` (`mysql2/promise`, `START TRANSACTION READ ONLY`, `SET SESSION max_execution_time = 30000`, `multipleStatements: false`, `connection.query(...).stream()`); both check host with `network-guard` first
- [X] T088 [P] [US4] Implement `backend/src/integrations/bi-connectors/http-api.ts` (`guardedFetch`, `AbortSignal.timeout`, size-capped body read, flatten, pagination)
- [X] T089 [US4] Implement `backend/src/integrations/bi-connectors/index.ts` exporting `BiConnectors` interface `{ read(kind, config, secrets, { storage }) → AsyncIterable<Record<string, unknown>>; listSheets(storagePath) }` and `createBiConnectors(config)`; add `biConnectors` to `AppContext` in `backend/src/context.ts`, to `server.ts`, and a `vi.fn()` fake in `fakeContext()` (`backend/src/test/context.ts`)
- [X] T090 [P] [US4] Implement `backend/src/models/bi/source.ts`, `snapshot.ts` and `relationship.ts` (functions from T079/T080); extend `datasetFor` and `compileQuery` for relationships (one hop, research §4)
- [X] T091 [US4] Implement `backend/src/controllers/bi-sources.ts`: `uploadSpreadsheet` (≤ 50 MB `FILE_TOO_LARGE` 413, `.csv`/`.xlsx` only `UNSUPPORTED_FILE` 415, saved with `ctx.storage.put('bi/<uuid>/<filename>', …)`, returns sheets), `previewSource`, `createSource`, `getSource`, `updateSource`, `deleteSource`, `refreshSource` (reads connector, samples first 1.000 rows for `buildFields` unless types are already set, normalizes, appends in batches of 1.000), `runDueRefreshes`, relationship use cases; extend `listSources` with external sources (`config`/`maskedSecrets` only for admins)
- [X] T092 [US4] Implement routes in `backend/src/routes/bi-sources.ts` per contracts/openapi.yaml: `POST /api/bi/uploads` (multipart, `requireAdmin`), `POST /api/bi/sources/preview`, `POST /api/bi/sources`, `GET/PATCH/DELETE /api/bi/sources/:sourceId`, `POST /api/bi/sources/:sourceId/refresh` (202, runs in background with errors logged via `ctx.log.error`), `GET/POST /api/bi/relationships`, `DELETE /api/bi/relationships/:relationshipId`; Zod discriminated union on `kind` for `config`; route tests in `backend/src/routes/bi-sources.test.ts` (attendant → 403 on writes; secrets absent from every response)
- [X] T093 [US4] Start the refresh scheduler in `backend/src/server.ts`: `setInterval(() => runDueRefreshes(ctx), 60_000)` with `unref()`, cleared on `onClose`; guard against overlapping runs with an in-flight flag
- [X] T094 [P] [US4] Implement source UI: `frontend/src/components/bi/source-form/` (`kind-picker.tsx`, `spreadsheet-fields.tsx`, `database-fields.tsx`, `api-fields.tsx`, `preview-table.tsx`, `field-types.tsx`) and pages `frontend/src/app/(painel)/fontes/page.tsx` (list: name, kind, rows, last refresh, last error badge, "Atualizar agora"), `fontes/nova/page.tsx`, `fontes/[id]/page.tsx` (edit, schedule select manual/15 min/1 h/6 h/24 h, field types and labels, delete with dependent-reports message, relationships section with two source/field pickers); `refetchInterval: 5_000` while `isRefreshing`
- [X] T095 [US4] Show freshness in reports: "Dados de <data>" per visual source and `staleWarning` banner in `frontend/src/components/bi/visual-frame.tsx`; pass relationships from `GET /api/bi/relationships` into `build-query` (T060) and list related-source fields in `field-list.tsx`
- [ ] T096 [US4] Verify US4 via quickstart.md §3 and §4 (including `docker compose --profile bi up -d mysql`)

**Checkpoint**: reports can combine CRM data with spreadsheets, databases and APIs.

---

## Phase 7: User Story 5 - Organizar, compartilhar e exportar relatórios (Priority: P2)

**Goal**: multiple pages, duplicate, share edit/view, conflict detection with overwrite, export
PNG/PDF.

**Independent Test**: quickstart.md §5.

### Tests for User Story 5 ⚠️

- [X] T097 [P] [US5] Write tests for `backend/src/models/bi/share.test.ts`: `replaceShares(db, reportId, shares)` replaces atomically; owner cannot be a share target; only `active` users; `listShares` with `userName`; `reportPermission` (extend `access.test.ts`) returns `edit`/`view` for shared users and `listReportsForUser` includes shared reports with their permission
- [X] T098 [P] [US5] Extend `backend/src/controllers/bi-reports.test.ts`: `duplicateReport` gives the caller ownership of an independent copy named "<nome> (cópia)" (requires any permission on the source report); `saveReport` with stale version → `REPORT_CONFLICT` 409 with `details { version, updatedAt, updatedByName }` (add `updated_by uuid null references users on delete set null` to `reports` via migration `0002_report_updated_by.sql` with RLS unchanged); `force: true` overwrites; `view` cannot save; only owner/admin manage shares
- [X] T099 [P] [US5] Write tests for `frontend/src/components/bi/page-tabs.test.tsx` (add, rename inline, reorder by drag and by "Mover para esquerda/direita" menu, delete with confirmation, at least 1 page, ≤ 20), `share-dialog.test.tsx` (pick active users, permission select, save calls `PUT /shares`), and conflict flow in `report-editor.test.tsx` (409 shows "Fulano salvou às hh:mm" with "Recarregar" and "Sobrescrever")
- [X] T100 [P] [US5] Write tests for `frontend/src/components/bi/export-menu.test.tsx`: "Imagem (PNG)" calls `html-to-image` `toPng` on the page node and downloads `"<relatório> - <página> - <aaaa-mm-dd>.png"`; "PDF" calls `window.print()`; the export header contains active filters and "Gerado em dd/mm/aaaa hh:mm"

### Implementation for User Story 5

- [X] T101 [P] [US5] Implement `backend/src/models/bi/share.ts`, extend `access.ts` and `report.ts` (`listReportsForUser` with shares, `updated_by`), add migration `backend/src/db/migrations/0002_report_updated_by.sql` via `npm run db:generate -w backend`
- [X] T102 [US5] Extend `backend/src/controllers/bi-reports.ts` (`duplicateReport`, conflict details, `force`, `listShares`, `replaceShares`) and routes in `backend/src/routes/bi-reports.ts` (`duplicateOf` in `POST /api/bi/reports`, `force` in `PUT`, `GET/PUT /api/bi/reports/:reportId/shares`); route test for conflict and share permissions
- [X] T103 [P] [US5] Implement `frontend/src/components/bi/page-tabs.tsx` (reducer actions `addPage`, `renamePage`, `movePage`, `removePage` in `editor-reducer.ts`; each page keeps its own filters and view state)
- [X] T104 [P] [US5] Implement `frontend/src/components/bi/share-dialog.tsx` (users from the existing `GET /api/users/assignable`, which already returns `{ id, name }` of active users to any logged-in user) and "Duplicar" action in `frontend/src/app/(painel)/relatorios/page.tsx` list (columns: nome, dono, permissão, atualizado em; sections "Meus" and "Compartilhados comigo")
- [X] T105 [P] [US5] Implement `frontend/src/components/bi/export-menu.tsx` and print stylesheet in `frontend/src/app/globals.css` (`@media print`: hide nav, toolbars, palette and panels; show `.bi-export-header`; one report page per sheet, landscape)
- [X] T106 [US5] Handle 409 in `report-editor.tsx` (conflict banner with reload/overwrite) and verify US5 via quickstart.md §5

**Checkpoint**: all user stories functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T107 [P] Implement `backend/scripts/seed-bi-perf.ts` (refuses non-local `DATABASE_URL`, like `seed-conversations.ts`; creates source "Vendas perf" kind `spreadsheet_file` with a succeeded snapshot of 500.000 rows `data`, `vendedor` (40 values), `regiao` (5), `valor`) and script `"db:seed:bi": "tsx --env-file=../.env scripts/seed-bi-perf.ts"` in `backend/package.json`
- [ ] T108 Run quickstart.md §6; if any visual query > 3 s, add expression indexes or switch to typed snapshot tables per research §1 and record the measurement in research.md
- [X] T109 [P] Mobile/tablet read-only: below `md`, `relatorios/[id]/page.tsx` always renders `report-view.tsx` with visuals stacked in one column in layout order and filters in a collapsible top bar (spec edge case "Tela pequena"); test in `report-view.test.tsx`
- [X] T110 [P] Accessibility pass over `components/bi/`: every drag action has a keyboard/menu equivalent (FR-008), charts have `aria` descriptions and a "Ver dados" table fallback, focus returns to the triggering control after dialogs; axe-free checks via Testing Library roles
- [X] T111 [P] Update `CLAUDE.md` Architecture with a short "BI" paragraph (snapshots in `bi_snapshot_rows`, compiler as the only SQL generator for reports, connectors behind network guard, scheduler in `server.ts`, `BI_SECRETS_KEY`) and Commands with `db:seed:bi` and `docker compose --profile bi up -d mysql`
- [X] T112 Run `npm run lint && npm run typecheck && npm run test:coverage` (≥ 80% lines in `backend/src/models/**` and `backend/src/controllers/**`) and fix failures
- [ ] T113 Run the full quickstart.md end to end and check SC-001, SC-003, SC-006, SC-007 manually

## Implementation status (2026-09-22)

Wired into the shared files: schema re-export + migration `0003_bi.sql` (with RLS; includes
`reports.updated_by`, so no separate 0002), config (`BI_SECRETS_KEY`, `BI_ALLOW_PRIVATE_NETWORKS`),
`biConnectors` in `AppContext`/`fakeContext`/`server.ts`, BI routes in `app.ts` (error handler sends
`details`), refresh scheduler in `server.ts`, `db:seed:bi`, nav links, `ApiError.details`, CLAUDE.md.
Sharing lives in `models/bi/report.ts` (no separate `share.ts`). Still open: the manual quickstart
checks T048, T058, T071, T096, T108, T113 (need Docker + running app).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none
- **Foundational (Phase 2)**: after Setup; blocks all stories
- **US1 (Phase 3)**: after Foundational. MVP
- **US2 (Phase 4)**: after US1 (drops fields into the US1 editor and reducer)
- **US3 (Phase 5)**: after US1 (adds filters/view mode to US1 visuals); independent of US2
- **US4 (Phase 6)**: after Foundational for backend (T072–T093); its UI integration (T095) and full independent test need US1; uses `type-inference.ts` from US2 (T053), so do T053 first if US4 starts before US2
- **US5 (Phase 7)**: after US1; view-only sharing needs US3's `report-view.tsx` (T070)
- **Polish (Phase 8)**: after the desired stories

### User Story Dependencies

```text
Setup → Foundational → US1 ─┬→ US2
                            ├→ US3 ─→ US5
                            └→ US4 (backend can start right after Foundational; needs T053)
```

### Within Each Story

- Tests first, confirm they fail
- Models → controllers → routes → frontend libs → components → pages → verification task

### Parallel Opportunities

- Setup: T002, T003, T004 in parallel after T001
- Foundational: T006, T009/T010, T011/T012, T019–T023 in parallel; T013→T014→T015 sequential
- US1: all tests T024–T032 in parallel; T033–T035 and T038–T041, T043–T044 in parallel
- US2 and US3 can proceed in parallel after US1 (different files except `report-canvas.tsx`/`chart-visual.tsx`; coordinate)
- US4 connectors T083–T088 fully parallel (one file each)
- US5 T103–T105 in parallel

---

## Parallel Example: User Story 4

```text
# Tests together:
T072 crypto.test.ts | T073 network-guard.test.ts | T074 csv/xlsx tests | T075 google-sheets.test.ts
T076 sql-guard.test.ts | T077 postgres/mysql tests | T078 http-api.test.ts

# Then one connector per agent:
T083 crypto.ts | T084 network-guard.ts | T085 csv.ts + xlsx.ts | T086 google-sheets.ts
T087 sql-guard.ts + postgres.ts + mysql.ts | T088 http-api.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 + Phase 2
2. Phase 3 (US1)
3. **STOP and validate** with quickstart.md §2: reports over WhatsApp data

### Incremental Delivery

1. MVP (US1) → demo
2. US2 (adaptive visuals, template) + US3 (interactivity) → P1 complete, "Power BI-like" over CRM data
3. US4 → external sources (highest security surface; review network guard and SQL guard carefully)
4. US5 → team use (sharing, pages, export)
5. Polish: performance at 500.000 rows, mobile read-only, docs

---

## Notes

- [P] = different files, no dependencies on incomplete tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- Never log secrets, connection strings with passwords or API headers marked secret
