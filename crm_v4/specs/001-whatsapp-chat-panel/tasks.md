---

description: "Task list for Painel de Chat do WhatsApp"
---

# Tasks: Painel de Chat do WhatsApp

**Input**: Design documents from `specs/001-whatsapp-chat-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED. The constitution (Princípio III) makes unit tests non-negotiable: every model and
controller gets a `*.test.ts` next to it; components with logic get Testing Library tests. Write each
story's tests first and confirm they fail before implementing.

**Organization**: Tasks are grouped by user story. US5 (cadastro, login e aprovação; FR-013, FR-017–FR-022)
is implemented in Foundational because every other story requires authentication; per the format rules
those tasks carry no story label. New tasks added after `/speckit-analyze` use IDs T097+ and sit in the
phase where they belong, so IDs are not strictly sequential in the file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 from spec.md
- Paths: `backend/src/`, `frontend/src/` (web app per plan.md). Tests live next to the code.

## Conventions for every task

- Backend layering (constitution I): `routes/` validate with Zod → call `controllers/` → map result.
  `controllers/` never import `db/`; `models/` never import Fastify, Next.js or HTTP types.
- Model tests use `backend/src/test/db.ts` (PGlite + real migrations). Controller tests mock models and
  integrations. Route tests use `app.inject`.
- JSON field names in API responses are camelCase exactly as in `contracts/openapi.yaml`.
- User-facing error messages are pt-BR. Errors are thrown as `DomainError(code, message, httpStatus)`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo, tooling and local infrastructure

- [X] T001 Create root `package.json` with npm workspaces `["frontend", "backend"]`, Node engine `>=22`, and scripts `dev` (`concurrently -n backend,frontend "npm run dev -w backend" "npm run dev -w frontend"`; add `concurrently` as root devDependency, since `npm run --workspaces` runs serially and the backend never exits), `test`, `lint`, `typecheck`, `format`; add root `.gitignore` (node_modules, .next, dist, coverage, .env, backend/.media)
- [X] T002 Create `docker-compose.yml` with `postgres:16` (user/password `postgres`, db `crm`, port 5432, volume; init script creating a second db `evolution`) and `atendai/evolution-api:v2.2.3` (port 8080, `AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY}`, `DATABASE_PROVIDER=postgresql`, `DATABASE_CONNECTION_URI=postgres://postgres:postgres@postgres:5432/evolution`, `CACHE_REDIS_ENABLED=false`, `CACHE_LOCAL_ENABLED=true`, `extra_hosts: host.docker.internal:host-gateway`); add `docker/postgres-init.sql`
- [X] T003 Create `.env.example` with every variable from quickstart.md: `DATABASE_URL`, `SESSION_COOKIE_SECURE`, `STORAGE_DRIVER`, `MEDIA_DIR`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`, `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `EVOLUTION_WEBHOOK_TOKEN`, `PUBLIC_BACKEND_URL`, `BACKEND_URL` (used by Next.js rewrite), `PORT=3333`
- [X] T004 Initialize `backend/` package: `package.json` (type module; deps fastify@5, @fastify/cookie, @fastify/multipart, @fastify/rate-limit, zod, fastify-type-provider-zod, drizzle-orm, postgres, @node-rs/argon2; devDeps typescript, tsx, drizzle-kit, vitest, @vitest/coverage-v8, @electric-sql/pglite, @types/node); scripts `dev` (tsx watch src/server.ts), `build`, `start`, `test` (vitest run), `test:coverage`, `typecheck`, `lint`, `db:generate`, `db:migrate`; `backend/tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`
- [X] T005 [P] Initialize `frontend/` with Next.js 15 App Router + TypeScript strict + Tailwind CSS 4 in `frontend/` (src dir, `@/*` alias); add deps @tanstack/react-query; devDeps vitest, @vitejs/plugin-react, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom; scripts `test`, `typecheck`, `lint`
- [X] T006 [P] Configure ESLint (typescript-eslint strict, `no-console: error`, `@typescript-eslint/no-explicit-any: error`, `max-lines-per-function: [warn, 40]`, `max-depth: [warn, 3]`; frontend errors go through `reportError(error, context)` in `frontend/src/lib/logger.ts`, the only file with a `no-console` override) and Prettier at root in `eslint.config.mjs` and `.prettierrc`; extend Next.js rules for `frontend/`
- [X] T007 [P] Configure Vitest in `backend/vitest.config.ts` (node env, include `src/**/*.test.ts`, coverage v8 with thresholds `lines: 80` for `src/models/**` and `src/controllers/**`) and `frontend/vitest.config.ts` (jsdom, react plugin, setup file `frontend/src/test/setup.ts` importing `@testing-library/jest-dom/vitest`)
- [X] T008 [P] Configure `frontend/next.config.ts` with `rewrites()` mapping `/api/:path*` → `${BACKEND_URL}/api/:path*` so cookies and SSE are same-origin; set `compress: false` so the proxied `text/event-stream` is not buffered
- [X] T009 [P] Copy `assets/images.jpeg` to `frontend/public/logo-v4.jpeg`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Config, database, error handling, realtime bus, brand shell and authentication (login, cadastro, aprovação de usuários). Every user story depends on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Backend core

- [X] T010 Implement env config in `backend/src/config.ts`: Zod schema for all `.env.example` variables, `STORAGE_DRIVER` enum `local|supabase` (Supabase vars required only when `supabase`), exits with a readable error listing invalid vars; export typed `config`
- [X] T011 [P] Implement `DomainError` class and helpers (`notFound`, `forbidden`, `conflict`, `unauthorized`) in `backend/src/lib/errors.ts`; unit test in `backend/src/lib/errors.test.ts`
- [X] T012 Define full Drizzle schema in `backend/src/db/schema.ts` exactly per data-model.md: enums `user_role (admin, attendant)`, `user_status (pending, active, disabled)`, `connection_status (disconnected, awaiting_qr, connected)`, `message_direction (inbound, outbound)`, `message_type (text, image, audio, video, document, unsupported)`, `message_status (pending, sent, delivered, read, failed)`; tables `users` (`email citext unique`), `sessions` (`token_hash unique`, `user_id` cascade), `whatsapp_connection` (`singleton boolean unique default true check (singleton)`), `contacts` (`wa_jid unique`), `conversations` (`contact_id unique`, `unread_count int >= 0` check, index `(last_message_at desc)`), `messages` (`wa_message_id unique null`, index `(conversation_id, sent_at desc)`, check `(direction = 'inbound' AND status IS NULL) OR (direction = 'outbound' AND status IS NOT NULL)`); every table has `id uuid default gen_random_uuid()`, `created_at`, `updated_at`
- [X] T013 Create `backend/drizzle.config.ts`, generate the initial migration into `backend/src/db/migrations/`, then prepend `CREATE EXTENSION IF NOT EXISTS citext;` at the top of it and append `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;` for all six tables (research §2); add `backend/src/db/migrate.ts` run by `npm run db:migrate`
- [X] T014 Implement db client in `backend/src/db/client.ts` (`postgres(config.DATABASE_URL, { prepare: false })` + drizzle) exporting `type Db` so models receive `db` as a parameter
- [X] T015 Implement test helper `backend/src/test/db.ts`: `createTestDb()` returns a fresh PGlite instance (with citext extension) wrapped by `drizzle-orm/pglite`, with the migrations from `backend/src/db/migrations/` applied; typed as `Db`
- [X] T016 [P] Implement in-memory event bus in `backend/src/realtime/bus.ts` (typed `publish(event)` / `subscribe(handler) → unsubscribe` for `message.created`, `message.updated`, `conversation.updated`, `connection.updated` per contracts/sse-events.md) with a comment noting the single-instance limit and `LISTEN/NOTIFY` upgrade path; unit test in `backend/src/realtime/bus.test.ts`
- [X] T017 Implement Fastify bootstrap in `backend/src/app.ts` (`buildApp(deps)` for tests: zod type provider, cookie, multipart with `limits.fileSize = 100 MB`, rate-limit registered with `global: false`, error handler mapping `DomainError` → `{ code, message }` with its status, Zod errors → 422 `VALIDATION_ERROR`, anything else → 500 logged via `request.log.error`) and `backend/src/server.ts` (listen on `config.PORT`, host `0.0.0.0`); route test for error mapping in `backend/src/app.test.ts`

### Authentication (login e cadastro)

- [X] T018 [P] Write tests for user model in `backend/src/models/user.test.ts`: create (email lowercased), `findByEmail`, `countAll`, `list({ status })`, `update`, `countActiveAdmins`; unique email violation surfaces as `conflict('EMAIL_TAKEN')`
- [X] T019 [P] Write tests for session model in `backend/src/models/session.test.ts`: create stores only SHA-256 of the token, `findValid` rejects expired sessions and users whose status is not `active`, renews `expires_at` to now + 7 days when less than 1 day remains, `deleteByToken`, `deleteAllForUser`
- [X] T020 [P] Implement user model in `backend/src/models/user.ts` (functions taking `db`; `name` 2–100 chars, `email` citext; never returns `password_hash` except from `findByEmailWithHash`)
- [X] T021 [P] Implement session model in `backend/src/models/session.ts` (token = 32 random bytes base64url from `node:crypto`; `token_hash` = SHA-256 hex; `expires_at` = now + 7 days)
- [X] T022 Write tests for auth controller in `backend/src/controllers/auth.test.ts` (models mocked): first signup → `role: admin, status: active` and returns session token; later signups → `role: attendant, status: pending` and no token; login with wrong email or password → same `unauthorized('INVALID_CREDENTIALS')`; login of `pending` → `ACCOUNT_PENDING` 403; `disabled` → `ACCOUNT_DISABLED` 403; logout deletes session
- [X] T023 Implement auth controller in `backend/src/controllers/auth.ts` (argon2id hash/verify via `@node-rs/argon2`; password min 8, max 128; runs a dummy verify when email not found to equalize timing)
- [X] T024 Write tests for users controller in `backend/src/controllers/users.test.ts`: only admins can list/patch; `pending → active`, `active → disabled` (also calls `deleteAllForUser`), `disabled → active`; admin cannot disable self; demoting or disabling the last active admin → `conflict('LAST_ADMIN')` 409
- [X] T025 Implement users controller in `backend/src/controllers/users.ts`
- [X] T026 Implement auth plugin in `backend/src/routes/auth-guard.ts`: reads cookie `v4_session`, resolves user via session model, decorates `request.user`; exports `requireAuth` and `requireAdmin` preHandlers (401 `UNAUTHENTICATED` / 403 `FORBIDDEN`)
- [X] T027 Implement routes in `backend/src/routes/auth.ts` (`POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; cookie `v4_session` httpOnly, `SameSite=Lax`, `Secure` when `SESSION_COOKIE_SECURE`, path `/`, maxAge 7 days; rate limit 10 req/min/IP on signup and login) and `backend/src/routes/users.ts` (`GET /api/users?status=`, `PATCH /api/users/:id`), bodies per contracts/openapi.yaml; route tests with `app.inject` in `backend/src/routes/auth.test.ts` covering cookie set/cleared and 401 without cookie

### Frontend shell, brand and auth screens

- [X] T028 [P] Define V4 brand tokens in `frontend/src/app/globals.css` with Tailwind `@theme`: `--color-brand: #E30613`, `--color-brand-dark: #B80510`, `--color-ink: #111111`, neutral grays, `--radius-*` set to 0–2px (geometric, echoing the logo); load Montserrat (weights 400/600/800) via `next/font/google` in `frontend/src/app/layout.tsx`; `<html lang="pt-BR">`, title "V4 Company MS&CO"
- [X] T029 [P] Implement API client in `frontend/src/lib/api.ts`: `apiFetch<T>(path, init)` with `credentials: 'include'`, JSON handling, throws `ApiError { status, code, message }` from the error body; on 401 redirects to `/login`; unit test in `frontend/src/lib/api.test.ts`
- [X] T030 [P] Implement `QueryProvider` in `frontend/src/lib/query-provider.tsx` and `useMe()` hook in `frontend/src/lib/use-me.ts` (GET `/api/auth/me`)
- [X] T031 [P] Implement `BrandLogo` component (logo `/logo-v4.jpeg` + text "V4 Company MS&CO", font-weight 800) in `frontend/src/components/brand-logo.tsx`
- [X] T032 Implement auth layout `frontend/src/app/(auth)/layout.tsx` (brand-red panel with `BrandLogo` on the left, white form area on the right; single column below 768px) and login page `frontend/src/app/(auth)/login/page.tsx` with `LoginForm` in `frontend/src/components/auth/login-form.tsx` (email + password, pt-BR messages for `INVALID_CREDENTIALS`, `ACCOUNT_PENDING` "Sua conta aguarda aprovação de um administrador", `ACCOUNT_DISABLED`; on success → `/chat`)
- [X] T033 Implement signup page `frontend/src/app/(auth)/cadastro/page.tsx` with `SignupForm` in `frontend/src/components/auth/signup-form.tsx` (name 2–100, email, password min 8 + confirmation; if response `status: active` → `/chat`, if `pending` → success screen "Cadastro enviado, aguarde aprovação"; `EMAIL_TAKEN` → "E-mail já cadastrado")
- [X] T034 [P] Tests for `LoginForm` and `SignupForm` in `frontend/src/components/auth/login-form.test.tsx` and `frontend/src/components/auth/signup-form.test.tsx`: client validation, each error code message, pending success screen, redirect on active
- [X] T035 Implement panel layout `frontend/src/app/(painel)/layout.tsx`: requires `useMe()` (redirect to `/login` on 401), sidebar with `BrandLogo`, links Chat / Conexão / Usuários (Usuários only for `role === 'admin'`), user name and "Sair" (POST logout → `/login`); `frontend/src/app/page.tsx` redirects to `/chat`
- [X] T036 Implement users admin page `frontend/src/app/(painel)/usuarios/page.tsx` with `UsersTable` in `frontend/src/components/users/users-table.tsx`: tabs Pendentes / Ativos / Desativados, actions Aprovar, Desativar, Reativar, Tornar admin / Tornar atendente (PATCH `/api/users/:id`), shows `LAST_ADMIN` error; test in `frontend/src/components/users/users-table.test.tsx`

- [X] T097 Test panel layout (after T035) in `frontend/src/app/(painel)/layout.test.tsx`: 401 from `/api/auth/me` redirects to `/login`; "Usuários" link rendered only for `role === 'admin'`; "Sair" calls logout and redirects to `/login`

**Checkpoint**: `npm test` green; first user signs up as admin, second is pending until approved (quickstart step 1).

---

## Phase 3: User Story 2 - Conectar o número de WhatsApp (Priority: P1)

Ordered before US1 because a live connection is needed for US1's end-to-end test.

**Goal**: Admin connects the single WhatsApp number via QR Code and everyone sees connection status in real time.

**Independent Test**: With no number connected, admin opens Conexão, clicks Conectar, reads the QR with a phone, status changes to "Conectado"; disconnecting from the phone shows the warning on all open tabs.

### Tests for User Story 2 ⚠️

- [X] T037 [P] [US2] Tests for Evolution client connection methods in `backend/src/integrations/evolution/client.test.ts` (mock global `fetch`): sends header `apikey`; `createInstance`, `connect` (returns QR base64), `connectionState`, `logout`, `setWebhook` (url `${PUBLIC_BACKEND_URL}/api/webhooks/evolution?token=…`, `webhook_by_events: false`, events `QRCODE_UPDATED, CONNECTION_UPDATE, MESSAGES_UPSERT, MESSAGES_UPDATE`); non-2xx, network error or a response body that fails its Zod schema → `DomainError('EVOLUTION_UNAVAILABLE', …, 502)`
- [X] T038 [P] [US2] Tests for connection model in `backend/src/models/connection.test.ts`: `get()` creates the singleton row with `status: disconnected` if missing; a second insert is impossible; `update` sets status/`last_qr`/`phone_number`/`last_connected_at`
- [X] T039 [P] [US2] Tests for connection controller in `backend/src/controllers/connection.test.ts`: `connect` creates instance when missing, calls `setWebhook`, stores QR, sets `awaiting_qr`, publishes `connection.updated`; `logout` sets `disconnected`; `handleQrUpdated` stores QR; `handleConnectionUpdate` maps `open → connected` (sets phone from `wuid`, clears QR, sets `last_connected_at`), `close → disconnected`, `connecting → no change`
- [X] T040 [P] [US2] Tests for webhook route in `backend/src/routes/webhooks.test.ts`: wrong/missing token → 401 and nothing processed; unknown event or other instance → 200 no-op; `QRCODE_UPDATED`/`CONNECTION_UPDATE` payloads (per contracts/evolution-webhook.md) dispatch to connection controller

### Implementation for User Story 2

- [X] T041 [P] [US2] Implement Evolution client connection methods in `backend/src/integrations/evolution/client.ts` (native `fetch`, base URL `EVOLUTION_URL`, instance `EVOLUTION_INSTANCE`; every response parsed with a Zod schema from `backend/src/integrations/evolution/response-schemas.ts` before returning, per constitution IV) and Zod schemas for webhook envelope `{ event, instance, data }` plus `QRCODE_UPDATED` and `CONNECTION_UPDATE` data in `backend/src/integrations/evolution/webhook-schemas.ts`
- [X] T042 [P] [US2] Implement connection model in `backend/src/models/connection.ts`
- [X] T043 [US2] Implement connection controller in `backend/src/controllers/connection.ts` (depends on T041, T042, T016)
- [X] T044 [US2] Implement webhook route `POST /api/webhooks/evolution` in `backend/src/routes/webhooks.ts`: token compared with `crypto.timingSafeEqual`, envelope validated, ignores `instance !== EVOLUTION_INSTANCE`, dispatches by event, always 200 after processing; structure dispatch so US1 can add `MESSAGES_UPSERT`/`MESSAGES_UPDATE` handlers
- [X] T045 [US2] Implement connection routes in `backend/src/routes/connection.ts`: `GET /api/connection` (requireAuth; `qrCode` only when `awaiting_qr`), `POST /api/connection/connect` and `POST /api/connection/logout` (requireAdmin)
- [X] T046 [US2] Implement SSE endpoint `GET /api/events` in `backend/src/routes/events.ts` (requireAuth; headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`; writes `event:`/`data:` for each bus event, `: ping` every 25s; before each ping re-validates the session via the session model and ends the stream if it is no longer valid, so a disabled user loses access within 25 s (FR-019); unsubscribes on `request.raw` close); route test in `backend/src/routes/events.test.ts` including a session invalidated mid-stream closing the connection
- [X] T047 [US2] Register webhook, connection and events routes in `backend/src/app.ts`
- [X] T048 [P] [US2] Implement `useEvents()` hook in `frontend/src/lib/use-events.ts`: single `EventSource('/api/events')`, on each event updates TanStack Query cache (`connection.updated` → `['connection']`), on `open` after an error invalidates `['connection']`, `['conversations']`, `['messages']`; mounted once in `(painel)/layout.tsx`; test with a fake EventSource in `frontend/src/lib/use-events.test.ts`
- [X] T049 [P] [US2] Implement `QrCodeCard` in `frontend/src/components/connection/qr-code-card.tsx`: states disconnected (button "Conectar" for admins only), awaiting_qr (QR image from data URL + "Abra o WhatsApp > Aparelhos conectados > Conectar"), connected (phone number, `lastConnectedAt`, button "Desconectar" for admins); test in `frontend/src/components/connection/qr-code-card.test.tsx` covering all states and admin vs attendant
- [X] T050 [US2] Implement Conexão page `frontend/src/app/(painel)/conexao/page.tsx` using `['connection']` query and `QrCodeCard`
- [X] T051 [US2] Implement `DisconnectedBanner` in `frontend/src/components/connection/disconnected-banner.tsx` (brand-red bar "WhatsApp desconectado" with link to Conexão when status ≠ connected) and render it in `(painel)/layout.tsx`; test in `frontend/src/components/connection/disconnected-banner.test.tsx`

**Checkpoint**: quickstart steps 2 and 7 pass.

---

## Phase 4: User Story 1 - Ver conversas e responder em tempo real (Priority: P1) 🎯 MVP

**Goal**: Attendants see conversations ordered by latest message, open one, read history in WhatsApp-style bubbles and reply with text in real time.

**Independent Test**: Send "oi" from an external phone → conversation appears at top with 1 unread in ≤3s; open → unread resets; reply → bubble goes enviando → enviada → entregue → lida and arrives on the phone; a second attendant sees it with the sender's name.

### Tests for User Story 1 ⚠️

- [X] T052 [P] [US1] Tests for contact model in `backend/src/models/contact.test.ts`: `upsertByJid` creates or updates (`name` only updated when provided), `phone` = digits of the JID; rejects JIDs ending in `@g.us`
- [X] T053 [P] [US1] Tests for conversation model in `backend/src/models/conversation.test.ts`: `getOrCreateForContact`; `list({ cursor, limit })` ordered `last_message_at desc` with contact joined and opaque cursor; `touch(id, { at, preview, incrementUnread })` (`last_message_preview` truncated to 120 chars); `markRead` sets `unread_count = 0`
- [X] T054 [P] [US1] Tests for message model in `backend/src/models/message.test.ts`: `insertInbound`/`insertOutbound` idempotent on `wa_message_id` (returns `{ created: false }` on duplicate); `listByConversation({ cursor, limit })` newest first; `advanceStatus` follows `pending → sent → delivered → read` and never regresses; `markFailed(error)`; `resetForRetry` only from `failed`; joins `sent_by` user `{ id, name }`
- [X] T055 [P] [US1] Tests for Evolution client message methods in `backend/src/integrations/evolution/client.test.ts`: `sendText(number, text)` returns WhatsApp `key.id`; `markAsRead(remoteJid, id)`; `fetchProfilePictureUrl(number)` returns URL or null; a malformed response (e.g. missing `key.id`) → `EVOLUTION_UNAVAILABLE`
- [X] T056 [P] [US1] Tests for pure helpers in `backend/src/controllers/webhook-mapping.test.ts`: JID filter (drops `@g.us`, `@broadcast`, `@newsletter`); `messageType` mapping (`conversation`/`extendedTextMessage` → text, `imageMessage` → image, `audioMessage` → audio, `videoMessage` → video, `documentMessage` → document, anything else → unsupported); status mapping (`SERVER_ACK` → sent, `DELIVERY_ACK` → delivered, `READ`/`PLAYED` → read); preview text ("📷 Imagem", "🎤 Áudio", "🎬 Vídeo", "📄 Documento", "Mensagem não suportada")
- [X] T057 [P] [US1] Tests for messages controller in `backend/src/controllers/messages.test.ts` (models, Evolution and bus mocked): `receive` creates contact/conversation/message, fetches the profile picture only when the contact is newly created (failure or null → `avatar_url` stays null, no throw), increments unread only for inbound and only when newly created, publishes `message.created`; `fromMe` with existing `wa_message_id` only advances status; `fromMe` unknown → creates outbound with `sent_by_user_id: null`; `sendText` rejects when connection ≠ connected with `WHATSAPP_DISCONNECTED` 409, text 1–4096 chars, inserts `pending` with `sent_by_user_id`, publishes, calls Evolution, stores `wa_message_id` + `sent`, on Evolution failure `markFailed` + publishes `message.updated`; `retry` only from `failed` else `NOT_RETRYABLE` 409; `updateStatus` publishes `message.updated`
- [X] T058 [P] [US1] Tests for conversations controller in `backend/src/controllers/conversations.test.ts`: `list`, `listMessages` (404 for unknown conversation), `markRead` zeroes unread, calls Evolution `markAsRead` for the latest inbound message (failures logged, not thrown), publishes `conversation.updated`

### Implementation for User Story 1

- [X] T059 [P] [US1] Implement contact model in `backend/src/models/contact.ts`
- [X] T060 [P] [US1] Implement conversation model in `backend/src/models/conversation.ts` (cursor = base64url of `last_message_at|id`)
- [X] T061 [P] [US1] Implement message model in `backend/src/models/message.ts` (cursor = base64url of `sent_at|id`; status order constant `STATUS_RANK`)
- [X] T062 [P] [US1] Add `sendText`, `markAsRead` and `fetchProfilePictureUrl` (`POST /chat/fetchProfilePictureUrl/{instance}`) to `backend/src/integrations/evolution/client.ts` with their response schemas in `backend/src/integrations/evolution/response-schemas.ts`, and `MESSAGES_UPSERT` / `MESSAGES_UPDATE` Zod schemas (fields listed in contracts/evolution-webhook.md) to `backend/src/integrations/evolution/webhook-schemas.ts`
- [X] T063 [P] [US1] Implement pure mapping helpers in `backend/src/controllers/webhook-mapping.ts`
- [X] T064 [US1] Implement messages controller in `backend/src/controllers/messages.ts` (`receive`, `updateStatus`, `sendText`, `retry`; text only in this story, media hook left for US3) and a serializer `toMessageDto` in `backend/src/controllers/dto.ts` producing the `Message` / `Conversation` shapes from contracts/openapi.yaml
- [X] T065 [US1] Implement conversations controller in `backend/src/controllers/conversations.ts`
- [X] T066 [US1] Wire `MESSAGES_UPSERT` → `messages.receive` and `MESSAGES_UPDATE` → `messages.updateStatus` in `backend/src/routes/webhooks.ts`; extend `backend/src/routes/webhooks.test.ts` with a duplicated `MESSAGES_UPSERT` (no duplicate row, unread +1 once) and a group message (ignored)
- [X] T067 [US1] Implement routes (all requireAuth) in `backend/src/routes/conversations.ts`: `GET /api/conversations` (`limit` 1–100 default 50, `cursor`), `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages` (JSON `{ text }` → 202), `POST /api/conversations/:id/read` (204), and `POST /api/messages/:id/retry` (202) in `backend/src/routes/messages.ts`; register in `backend/src/app.ts`; route tests in `backend/src/routes/conversations.test.ts`
- [X] T068 [P] [US1] Implement formatters in `frontend/src/lib/format.ts` (message time `HH:mm`, list time: today → `HH:mm`, yesterday → "Ontem", else `dd/MM/yyyy`; day separators "Hoje"/"Ontem"/date; contact display name falls back to formatted phone); tests in `frontend/src/lib/format.test.ts`
- [X] T069 [P] [US1] Implement `ConversationList` + `ConversationItem` in `frontend/src/components/chat/conversation-list.tsx` (avatar, falling back to initials when `avatarUrl` is null or the image fails to load via `onError`, since WhatsApp profile URLs expire; name, preview, time, red unread badge, selected state, infinite scroll via `useInfiniteQuery(['conversations', filters])`); test in `frontend/src/components/chat/conversation-list.test.tsx`
- [X] T070 [P] [US1] Implement `MessageBubble` in `frontend/src/components/chat/message-bubble.tsx` (outbound right / inbound left, time, status ticks: pending clock, sent ✓, delivered ✓✓, read ✓✓ in brand color, failed red "Falhou · Reenviar" button calling retry; `sentBy.name` label above outbound bubbles; `unsupported` → italic "Tipo de mensagem não suportado"); test in `frontend/src/components/chat/message-bubble.test.tsx` covering every status and the unsupported type
- [X] T071 [P] [US1] Implement `Composer` in `frontend/src/components/chat/composer.tsx` (textarea, Enter sends, Shift+Enter newline, trims, blocks empty and > 4096 chars, disabled with hint when connection ≠ connected); test in `frontend/src/components/chat/composer.test.tsx`
- [X] T072 [US1] Implement `MessageThread` in `frontend/src/components/chat/message-thread.tsx`: `useInfiniteQuery(['messages', conversationId])` newest-first, renders oldest at top with day separators, loads older when scrolled to top while keeping scroll position, auto-scrolls to bottom on new message only when already near bottom; header with contact name/phone
- [X] T073 [US1] Implement Chat page `frontend/src/app/(painel)/chat/page.tsx` (two columns list | thread on ≥768px; below 768px shows list or thread with a back button, selected id in `?c=` search param) and call `POST /read` when a conversation opens or receives a message while open
- [X] T074 [US1] Extend `frontend/src/lib/use-events.ts`: `message.created` → prepend to `['messages', id]` first page and move conversation to top of `['conversations', …]`; `message.updated` → replace in place; `conversation.updated` → replace in list; add cases to `frontend/src/lib/use-events.test.ts`

- [X] T098 [P] [US1] Test `MessageThread` in `frontend/src/components/chat/message-thread.test.tsx`: renders oldest-to-newest with day separators; requests the next page when scrolled to top and keeps the scroll anchor; auto-scrolls on a new message only when already near the bottom
- [X] T099 [P] [US1] Test Chat page in `frontend/src/app/(painel)/chat/page.test.tsx`: selecting a conversation sets `?c=` and calls `POST /read`; a new inbound message in the open conversation calls `POST /read` again; below 768px shows only the list or only the thread, with a working back button
- [X] T100 [US1] Implement `OfflineBanner` in `frontend/src/components/connection/offline-banner.tsx` (listens to `online`/`offline` events; shows "Sem conexão com a internet"; on `online` invalidates `['conversations']` and `['messages']`) rendered in `(painel)/layout.tsx`, and persist the `Composer` draft per conversation in `sessionStorage` (wrapped in try/catch) so it survives reloads and offline periods; tests in `frontend/src/components/connection/offline-banner.test.tsx` and `frontend/src/components/chat/composer.test.tsx`

**Checkpoint**: MVP. quickstart steps 3, 4, 5 and 8 pass.

---

## Phase 5: User Story 3 - Encontrar conversas e ver mídias (Priority: P2)

**Goal**: Search/filter conversations; receive and view images, audio, video and documents; send images and documents.

**Independent Test**: Search part of a name → list filters; receive image + audio + PDF → shown/playable/downloadable; send an image and a document → arrive on the phone.

### Tests for User Story 3 ⚠️

- [X] T075 [P] [US3] Tests for storage drivers in `backend/src/integrations/storage/storage.test.ts`: `local` driver writes/reads/streams under a temp `MEDIA_DIR`; `supabase` driver calls `POST {SUPABASE_URL}/storage/v1/object/{bucket}/{key}` and `GET …/object/authenticated/{bucket}/{key}` with `Authorization: Bearer <service role>` (fetch mocked); `createStorage(config)` picks by `STORAGE_DRIVER`
- [X] T076 [P] [US3] Tests for Evolution media methods in `backend/src/integrations/evolution/client.test.ts`: `getMediaBase64(messageKey)` and `sendMedia({ number, mediatype, mimetype, caption, media (base64), fileName })`, including malformed responses (missing `base64` / `key.id`) → `EVOLUTION_UNAVAILABLE`
- [X] T077 [P] [US3] Extend `backend/src/models/conversation.test.ts`: `list({ search, unread })` matches `ILIKE` on contact name or phone (case-insensitive, partial), `unread: true` returns only `unread_count > 0`
- [X] T078 [P] [US3] Extend `backend/src/controllers/messages.test.ts`: inbound media downloads base64 → storage → sets `media_path`, `media_mime`, `media_filename`, `media_size` and publishes `message.updated`; download failure keeps message without `media_path` (no throw); `sendMedia` accepts only `image/*` (≤16 MB) and documents (≤100 MB), else `415`/`413`; `getMedia` retries download when `media_path` is null

### Implementation for User Story 3

- [X] T079 [P] [US3] Implement storage in `backend/src/integrations/storage/index.ts` (`Storage` type `{ put(key, buffer, mime), get(key) → Readable }`), `backend/src/integrations/storage/local.ts` and `backend/src/integrations/storage/supabase.ts` (native `fetch`, no SDK); keys `media/{yyyy}/{mm}/{messageId}`
- [X] T080 [P] [US3] Add `getMediaBase64` and `sendMedia` to `backend/src/integrations/evolution/client.ts` with response schemas in `backend/src/integrations/evolution/response-schemas.ts`
- [X] T081 [US3] Add `search` and `unread` filters to `backend/src/models/conversation.ts` (escape `%`/`_` in the search term) and add `setMedia` to `backend/src/models/message.ts`
- [X] T082 [US3] Extend `backend/src/controllers/messages.ts` with inbound media persistence, `sendMedia` and `getMedia`; include `media: { url: '/api/messages/{id}/media', mime, filename, size }` in `toMessageDto`
- [X] T083 [US3] Extend routes: `GET /api/conversations` accepts `search` (max 100) and `unread` in `backend/src/routes/conversations.ts`; `POST /api/conversations/:id/messages` accepts `multipart/form-data` (`file`, optional `caption` max 1024); `GET /api/messages/:id/media` streams with `Content-Type` = `media_mime` and `Content-Disposition` (inline for image/audio/video, attachment for documents) in `backend/src/routes/messages.ts`; route tests for both
- [X] T084 [P] [US3] Implement `ConversationSearch` in `frontend/src/components/chat/conversation-search.tsx` (debounced 300 ms input + "Não lidas" toggle feeding the `['conversations', { search, unread }]` key); test in `frontend/src/components/chat/conversation-search.test.tsx`
- [X] T085 [P] [US3] Implement `MediaContent` in `frontend/src/components/chat/media-content.tsx` (image thumbnail opening full size, `<audio controls>`, `<video controls>`, document card with filename/size and download link; placeholder "Carregando mídia…" when `media` is null) and render it inside `MessageBubble`; test in `frontend/src/components/chat/media-content.test.tsx`
- [X] T086 [US3] Add attachment button to `frontend/src/components/chat/composer.tsx` (accept `image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip`, preview with optional caption, client-side size check 16 MB images / 100 MB documents with pt-BR error, sends multipart); extend `frontend/src/components/chat/composer.test.tsx`
- [X] T087 [US3] Wire `ConversationSearch` into `frontend/src/app/(painel)/chat/page.tsx` with an empty state "Nenhuma conversa encontrada"

**Checkpoint**: quickstart step 6 passes.

---

## Phase 6: User Story 4 - Identidade visual V4 Company MS&CO (Priority: P2)

**Goal**: Every screen carries the V4 brand consistently and accessibly. Tokens and logo already exist from Phase 2; this phase finishes and verifies them.

**Independent Test**: Visual review of login, cadastro, usuários, conexão and chat against `assets/images.jpeg`; automated contrast test passes.

- [X] T088 [P] [US4] Create shared UI primitives with brand styling in `frontend/src/components/ui/button.tsx` (variants `primary` = `bg-brand text-white hover:bg-brand-dark`, `secondary` = white with brand border, `danger`), `frontend/src/components/ui/input.tsx` and `frontend/src/components/ui/badge.tsx`; replace ad-hoc buttons/inputs in auth, users, connection and chat components
- [X] T089 [P] [US4] Add contrast test in `frontend/src/styles/contrast.test.ts` computing WCAG ratio for white on `#E30613`, white on `#B80510` and `#111111` on white; each must be ≥ 4.5
- [X] T090 [P] [US4] Add brand accents: chat header strip in brand red, empty chat state with large logo and "V4 Company MS&CO", favicon from logo in `frontend/src/app/icon.jpeg`; visible focus ring in brand color on all interactive elements in `frontend/src/app/globals.css`
- [X] T091 [US4] Responsive pass (FR-016) on `(auth)/layout.tsx`, `(painel)/layout.tsx` (sidebar collapses to top bar below 768px) and `chat/page.tsx`; verify no horizontal scroll at 375px, 768px, 1280px

**Checkpoint**: quickstart step 10 passes.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T092 [P] Add `npm run test:coverage` for both apps and ensure `backend/src/models/**` and `backend/src/controllers/**` meet the 80% line threshold; add missing tests where below
- [X] T093 [P] Add CI workflow `.github/workflows/ci.yml` (Node 22: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`)
- [X] T094 [P] Security review across `backend/src/` and `frontend/src/`: confirm no secret uses `NEXT_PUBLIC_`, `password_hash` never serialized (grep `toUserDto`), all six tables have RLS in the migration, webhook token uses `timingSafeEqual`, rate limit active on auth routes
- [X] T095 [P] Update `CLAUDE.md` with real commands (dev, test, single test file, migrate, docker compose) and the actual folder layout
- [X] T101 [P] Add seed script `backend/scripts/seed-conversations.ts` (`npm run db:seed:perf -w backend`) creating 5,000 contacts/conversations with one message each; used by quickstart step 9 to confirm the chat list loads in < 2 s (SC-004)
- [ ] T096 Run every step of `specs/001-whatsapp-chat-panel/quickstart.md` against local docker compose and fix failures

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories → **Polish (Phase 7)**
- Foundational blocks everything (DB schema, auth, SSE bus, brand shell).

### User Story Dependencies

- **US2 (connection)**: after Foundational. No story dependencies.
- **US1 (chat)**: after Foundational. Depends on US2's T046 (SSE endpoint) and T048 (`useEvents`) for FR-006, and on T044 (webhook route with token check); if US1 is built first, do those three tasks first. End-to-end validation needs a connected number (US2).
- **US3 (search/media)**: extends US1 files (conversation model, messages controller, composer, bubble), so start after US1.
- **US4 (brand)**: after Foundational; best done after US1–US3 screens exist since it restyles them.

### Within Each Story

- Tests first (must fail) → models → integrations → controllers → routes → frontend components → page wiring.

### Parallel Opportunities

- Setup: T005–T009 in parallel after T001–T004.
- Foundational: T011, T016 parallel with T012–T015; T018–T021 parallel; T028–T031 parallel with backend auth work.
- US2: all tests T037–T040 in parallel; T041/T042 parallel; frontend T048/T049 parallel with backend T043–T047.
- US1: tests T052–T058, T098, T099 in parallel; models T059–T063 in parallel; frontend T068–T071 in parallel with backend T064–T067.
- US3: tests T075–T078 in parallel; T079/T080 parallel; T084/T085 parallel.
- US4: T088–T090 in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first, all together:
Task: "Tests for contact model in backend/src/models/contact.test.ts"
Task: "Tests for conversation model in backend/src/models/conversation.test.ts"
Task: "Tests for message model in backend/src/models/message.test.ts"
Task: "Tests for pure helpers in backend/src/controllers/webhook-mapping.test.ts"

# Then models together:
Task: "Implement contact model in backend/src/models/contact.ts"
Task: "Implement conversation model in backend/src/models/conversation.ts"
Task: "Implement message model in backend/src/models/message.ts"

# Frontend components alongside backend controllers:
Task: "Implement MessageBubble in frontend/src/components/chat/message-bubble.tsx"
Task: "Implement Composer in frontend/src/components/chat/composer.tsx"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → Phase 2 Foundational (login/cadastro working)
2. Phase 3 US2 (connect number) → Phase 4 US1 (text chat in real time)
3. **STOP and VALIDATE** with quickstart steps 1–5, 7 and 8. This is the MVP: a branded, authenticated, real-time WhatsApp text panel.

### Incremental Delivery

1. + US3 → search and media (quickstart step 6)
2. + US4 → brand polish and responsive (quickstart step 10)
3. Polish → coverage, CI, security review, full quickstart run

---

## Notes

- [P] = different files, no dependencies on incomplete tasks
- Tests must fail before implementation (constitution III)
- Stop at any checkpoint to validate a story independently
- Avoid cross-story coupling beyond the shared files noted in User Story Dependencies
