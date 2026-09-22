# Implementation Plan: Funis e Pipelines de Leads

**Branch**: `002-sales-pipelines` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-sales-pipelines/spec.md`

## Summary

Funis configuráveis por administradores, cada um com um pipeline de etapas (reordenáveis
arrastando), e um quadro kanban onde qualquer usuário ativo move leads entre etapas por arrastar,
teclado ou menu "Mover para", com atualização em tempo real. Leads nascem de contatos do WhatsApp:
automaticamente na primeira mensagem recebida (se houver funil de entrada) ou manualmente pelo
chat. Cada lead tem valor, responsável, anotações e histórico de etapas.

Abordagem: estende o monorepo da 001 sem mudar a arquitetura. Backend ganha 4 tabelas, 3 models,
2 controllers e rotas; a entrada automática é uma chamada a mais no controller de mensagens. O
tempo real reutiliza o EventBus/SSE com 3 eventos novos. O frontend ganha as páginas de funis, o
quadro com dnd-kit e um bloco de lead no cabeçalho da conversa.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict) em Node.js 22 LTS (igual à 001)

**Primary Dependencies**: as da 001 (Fastify 5, Zod 4, Drizzle 0.45, Next.js 16, React 19,
TanStack Query 5, Tailwind 4). Novas: `@dnd-kit/core` 6 e `@dnd-kit/sortable` 10 no frontend
(research §1).

**Storage**: PostgreSQL 16 local / Supabase em produção; migration nova gerada pelo drizzle-kit (próximo número livre, ex.: `0001_pipelines.sql`) com RLS.

**Testing**: Vitest; models com PGlite (`createTestDb()`), controllers com models mockados, rotas
com `app.inject`, componentes com Testing Library (teclado do dnd-kit e menu "Mover para").

**Target Platform**: igual à 001 (servidor Linux; navegadores desktop, tablet e celular).

**Project Type**: web application (frontend + backend)

**Performance Goals**: movimento visível para outros usuários em ≤ 3 s p95 (SC-001); quadro com
2.000 leads em < 2 s (SC-003); lead de entrada automática em ≤ 5 s (SC-004).

**Constraints**: uma instância do backend (EventBus em memória, herdado da 001); até 20 etapas por
funil; um lead por contato por funil; um funil de entrada ativo.

**Scale/Scope**: ~20 usuários simultâneos, dezenas de funis, até 2.000 leads por funil; 3 telas
novas (lista de funis, quadro, montagem de etapas) + painel de detalhes do lead + bloco no chat.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Como o plano cumpre | Status |
|---|---|---|
| I. MVC | Models `pipeline.ts`, `stage.ts`, `lead.ts` (únicos com Drizzle; regras de posição, limite de etapas, funil de entrada, lead único por funil). Controllers `pipelines.ts` (funis e etapas) e `leads.ts` (quadro, CRUD, mover, entrada automática), sem `db/`. Rotas `routes/pipelines.ts` e `routes/leads.ts`: Zod → controller → resposta. `messages.receive` chama `leads.enterFromWhatsApp` (controller → controller, mesmo padrão de `connection.isConnected`). View só usa a API. | ✅ |
| II. Código limpo | Constantes nomeadas (`STAGE_LIMIT`, `DEFAULT_STAGES`, `POSITION_GAP`, `BOARD_PAGE_SIZE`); erros de domínio com códigos (`LEAD_EXISTS`, `STAGE_NOT_EMPTY`, `LOST_REASON_REQUIRED`…) em pt-BR; DTOs em `dto.ts`. | ✅ |
| III. Testes unitários | `*.test.ts` para os 3 models (PGlite: posições e renumeração, índices parciais, cascata de exclusão de etapa, histórico) e os 2 controllers (mocks: permissão, validações, eventos publicados, entrada automática); teste de `messages.receive` cobre o gatilho; rotas com `app.inject`. Frontend: `pipeline-cache.ts` (puro), quadro (teclado + "Mover para" + motivo de perda), montagem de etapas, bloco do lead no chat. Cobertura ≥ 80% mantida. | ✅ |
| IV. Fronteiras seguras | Zod em todo body/query/params novo; rotas de estrutura com `requireAdmin`; `assigneeId` validado como usuário ativo; RLS nas 4 tabelas; nenhum segredo novo. | ✅ |
| V. Simplicidade | Uma dependência nova justificada (dnd-kit: teclado/toque/anúncios que o HTML5 DnD não dá). Posições fracionárias em vez de LexoRank; reordenar etapas por lista completa; `pipeline.changed` faz refetch em vez de diffs; sem mover leads entre funis, campos personalizados ou automações. | ✅ |

**Re-check pós-design (Phase 1)**: data-model, contratos e SSE mantêm as regras acima. ✅ Sem
violações (constituição v1.1.0).

## Project Structure

### Documentation (this feature)

```text
specs/002-sales-pipelines/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml     # endpoints novos (/pipelines, /leads, /users/assignable)
│   └── sse-events.md    # lead.upserted, lead.deleted, pipeline.changed
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

Só arquivos novos (+) e alterados (~):

```text
backend/src/
├── db/
│   ├── schema.ts                     ~ enums stage_kind, stage_color; pipelines, pipeline_stages, leads, lead_stage_changes
│   └── migrations/0001_pipelines.sql + gerada pelo drizzle-kit, + RLS + seed do funil "Vendas"
├── models/
│   ├── pipeline.ts (+ .test.ts)      + CRUD, funil de entrada, arquivar/reativar
│   ├── stage.ts (+ .test.ts)         + criar/editar/reordenar/excluir com remanejamento
│   ├── lead.ts (+ .test.ts)          + quadro (contagens/somas/páginas), mover, posições, histórico, leads do contato
│   └── user.ts                       ~ listActive() para responsáveis
├── controllers/
│   ├── pipelines.ts (+ .test.ts)     + casos de uso de funis/etapas + publica pipeline.changed
│   ├── leads.ts (+ .test.ts)         + quadro, criar, editar, mover, excluir, enterFromWhatsApp + publica lead.*
│   ├── messages.ts (~ .test.ts)      ~ receive chama leads.enterFromWhatsApp na 1ª mensagem recebida
│   └── dto.ts                        ~ toPipelineDto, toStageDto, toLeadDto, toLeadDetailDto
├── routes/
│   ├── pipelines.ts (+ .test.ts)     + /api/pipelines/**
│   ├── leads.ts (+ .test.ts)         + /api/leads/**
│   └── users.ts                      ~ GET /api/users/assignable
├── realtime/bus.ts                   ~ tipos lead.upserted, lead.deleted, pipeline.changed
└── app.ts                            ~ registra rotas novas

backend/scripts/seed-pipeline-leads.ts + 2.000 leads (recusa banco não local)

frontend/src/
├── app/(painel)/funis/
│   ├── page.tsx                      + lista de funis (admin: criar) → abre o quadro
│   ├── [pipelineId]/page.tsx         + quadro + filtros + painel do lead (?lead=)
│   └── [pipelineId]/etapas/page.tsx  + montagem de etapas (admin)
├── components/pipeline/
│   ├── board.tsx (+ .test.tsx)       + DndContext, colunas, anúncios pt-BR
│   ├── stage-column.tsx              + coluna com contagem, soma e "carregar mais"
│   ├── lead-card.tsx                 + cartão (nome/número, valor, responsável, tempo na etapa, não lidas) + "Mover para"
│   ├── lost-reason-dialog.tsx (+ .test.tsx)
│   ├── lead-panel.tsx (+ .test.tsx)  + detalhes, edição e histórico
│   ├── stage-editor.tsx (+ .test.tsx)+ etapas arrastáveis, cor, tipo, exclusão com destino
│   └── board-filters.tsx             + Meus leads / Sem responsável / responsável / busca
├── components/chat/lead-strip.tsx (+ .test.tsx) + funil/etapa/responsável no cabeçalho, trocar etapa, "Criar lead"
├── components/panel-nav.tsx          ~ item "Funis"
├── lib/
│   ├── use-pipelines.ts              + queries/mutações (otimista no mover, rollback em erro)
│   ├── pipeline-cache.ts (+ .test.ts)+ applyLeadUpsert, applyLeadDelete, applyLeadMove (puras)
│   ├── use-events.ts (~ .test.tsx)   ~ trata eventos novos
│   ├── format.ts                     ~ formatBRL, formatTimeInStage
│   └── types.ts                      ~ Pipeline, Stage, Lead, Board
├── app/globals.css                   ~ tokens das 8 cores de etapa
└── styles/contrast.test.ts           ~ inclui as cores de etapa
```

**Structure Decision**: mesma estrutura web da 001 (npm workspaces `backend/` + `frontend/`). Tudo
novo segue as camadas existentes; nenhum pacote ou app novo.

## Complexity Tracking

Sem violações da constituição a justificar.
