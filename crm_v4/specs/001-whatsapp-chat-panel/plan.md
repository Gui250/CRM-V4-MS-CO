# Implementation Plan: Painel de Chat do WhatsApp

**Branch**: `001-whatsapp-chat-panel` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-whatsapp-chat-panel/spec.md`

## Summary

Painel de atendimento WhatsApp do CRM **V4 Company MS&CO**: um número conectado por QR Code via
Evolution API, lista de conversas e chat em tempo real (texto e mídia), com a identidade visual da
V4. Inclui também **login, cadastro e aprovação de usuários** (US5 da spec).

Abordagem: monorepo com dois apps. `frontend/` (Next.js + TypeScript) é só a camada **View**.
`backend/` (Node.js + Fastify + TypeScript) contém **Controllers** e **Models** (MVC), fala com a
Evolution API, recebe seus webhooks e empurra eventos ao navegador por Server-Sent Events. Dados em
Postgres: container local em desenvolvimento, Supabase (Postgres gerenciado) em produção, com o
mesmo código e as mesmas migrations. Autenticação própria no backend (sessão em cookie httpOnly),
porque Supabase Auth não existe no Postgres local.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) em Node.js 22 LTS

**Primary Dependencies**:
- Backend: Fastify 5, `@fastify/cookie`, `@fastify/multipart`, Zod (+ `fastify-type-provider-zod`),
  Drizzle ORM + `postgres` (driver), `drizzle-kit` (migrations), `@node-rs/argon2` (hash de senha)
- Frontend: Next.js 15 (App Router), React 19, Tailwind CSS 4, TanStack Query 5

**Storage**: PostgreSQL 16 (Docker) em dev; Supabase Postgres em produção. Mídias: disco local em
dev, Supabase Storage em produção (ver research.md §6).

**Testing**: Vitest em ambos os apps; Testing Library + jsdom no frontend; `fastify.inject` para
rotas; PGlite (Postgres em memória, WASM) para testes de models sem banco real nem rede.

**Target Platform**: servidor Linux (backend e frontend em containers/Node); navegadores desktop e
tablet modernos.

**Project Type**: web application (frontend + backend)

**Performance Goals**: mensagem recebida visível em ≤3 s p95 (SC-001); lista de conversas em ≤2 s
com 5.000 conversas (SC-004).

**Constraints**: um número de WhatsApp; uma instância do backend (pub/sub em memória para SSE);
Evolution API não assina webhooks, então a origem é validada por token secreto.

**Scale/Scope**: ~20 atendentes simultâneos, até 5.000 conversas, ~6 telas (login, cadastro,
usuários, conexão, chat).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Como o plano cumpre | Status |
|---|---|---|
| I. MVC | `backend/src/models` (Drizzle + regras), `backend/src/controllers` (casos de uso), `backend/src/routes` (adaptadores finos: Zod → controller → resposta), `backend/src/integrations` (Evolution, storage). View = `frontend/`, que nunca acessa o banco; só chama a API. Dependências só View → Controller → Model/Integration. | ✅ |
| II. Código limpo | TS strict, ESLint + Prettier nos dois apps, logger pino do Fastify, erros de domínio (`DomainError`) mapeados para HTTP num único error handler. | ✅ |
| III. Testes unitários | Vitest; todo model/controller com `*.test.ts` ao lado; models testados com PGlite, integrações mockadas; componentes com lógica (lista, bolha de mensagem, composer, formulários de auth) com Testing Library; cobertura ≥80% em models/controllers na CI. | ✅ |
| IV. Fronteiras seguras | Zod em todo body/query/params e no payload do webhook; token secreto no webhook; segredos só em env do backend; RLS habilitado em todas as tabelas (sem policies → bloqueia Data API do Supabase; backend conecta como owner). Senhas com argon2id; cookie httpOnly/SameSite=Lax/Secure. | ✅ |
| V. Simplicidade | SSE nativo em vez de WebSocket; pub/sub em memória; auth própria mínima (sem lib de auth); sem pacote `shared`. Dependências novas justificadas em research.md. | ✅ |

**Re-check pós-design (Phase 1)**: data-model e contratos mantêm as regras acima. ✅ Sem violações
(avaliado contra a constituição v1.1.0). Respostas da Evolution API são validadas com Zod antes de
chegar aos controllers (Princípio IV).

## Project Structure

### Documentation (this feature)

```text
specs/001-whatsapp-chat-panel/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml         # API REST do backend (consumida pelo frontend)
│   ├── sse-events.md        # eventos em tempo real (GET /api/events)
│   └── evolution-webhook.md # eventos recebidos da Evolution API
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
package.json                 # npm workspaces: frontend, backend
docker-compose.yml           # postgres (dev) + evolution-api
.env.example

backend/
├── src/
│   ├── server.ts            # bootstrap Fastify, plugins, error handler
│   ├── config.ts            # env validado com Zod
│   ├── db/
│   │   ├── schema.ts        # tabelas Drizzle
│   │   ├── client.ts
│   │   └── migrations/      # geradas pelo drizzle-kit (+ RLS)
│   ├── models/              # user, session, connection, contact, conversation, message
│   ├── controllers/         # auth, users, connection, conversations, messages, webhook
│   ├── routes/              # adaptadores HTTP + requireAuth/requireAdmin
│   ├── integrations/
│   │   ├── evolution/       # cliente HTTP da Evolution API
│   │   └── storage/         # driver local | supabase
│   ├── realtime/            # event bus em memória + endpoint SSE
│   └── lib/                 # errors, logger helpers
└── vitest.config.ts         # testes *.test.ts ao lado do código

frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/login/  (auth)/cadastro/
│   │   └── (painel)/chat/  conexao/  usuarios/
│   ├── components/          # ConversationList, MessageBubble, Composer, QrCodeCard, BrandHeader…
│   ├── lib/                 # api client (fetch), useEvents (EventSource), formatters
│   └── styles/              # tokens da marca V4 (Tailwind @theme)
├── public/logo-v4.jpeg      # cópia de assets/images.jpeg
└── vitest.config.ts
```

**Structure Decision**: web application com `frontend/` e `backend/` em npm workspaces. O Next.js
faz rewrite de `/api/*` para o Fastify, então navegador, cookies e SSE ficam na mesma origem.

## Complexity Tracking

Sem violações da constituição a justificar.
