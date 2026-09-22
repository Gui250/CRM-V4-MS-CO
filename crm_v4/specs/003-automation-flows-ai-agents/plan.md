# Implementation Plan: Fluxos de Automação e Agentes de IA

**Branch**: `003-automation-flows-ai-agents` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-automation-flows-ai-agents/spec.md`

## Summary

Automações estilo n8n dentro do CRM: um editor visual onde o admin monta fluxos (gatilho →
ações), agentes de IA configuráveis em três provedores (OpenAI, Anthropic, Gemini) que respondem
pelo WhatsApp, passagem segura para atendimento humano, e disparo de fluxos a partir do chat.

Abordagem: nenhum serviço novo. O editor usa React Flow no `frontend/`. O fluxo é salvo como grafo
JSON em versões imutáveis. Um motor de execução no `backend/` (controller) interpreta o grafo,
com o estado das execuções em Postgres. Esperas e retomadas usam uma coluna `resume_at` e um laço
de 5 s com `FOR UPDATE SKIP LOCKED`, então sobrevivem a reinícios. O gatilho nasce no
`messages.receive` já existente (webhook da Evolution). O envio reaproveita o pipeline de envio
do painel, e o tempo real reaproveita o SSE da feature 001. OpenAI e Gemini são chamados com
`fetch` nativo e respostas validadas com Zod; a Anthropic, pelo SDK oficial. As chaves ficam
cifradas com AES-256-GCM.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) em Node.js 22 LTS (igual à feature 001)

**Primary Dependencies**: as da feature 001 (Fastify 5, Zod 4, Drizzle, Next.js 16, React 19,
TanStack Query 5, Tailwind 4). **Novas**: `@xyflow/react` 12 no frontend (research §1) e
`@anthropic-ai/sdk` no backend, só para o provedor Anthropic (research §5). OpenAI e Gemini usam
`fetch` nativo; cifragem com `node:crypto`; timeouts com `AbortSignal.timeout`.

**Storage**: Postgres (mesmo banco; 6 tabelas novas e colunas em `conversations`, `contacts`,
`messages`; ver [data-model.md](./data-model.md)). Arquivos do bloco "enviar mídia" no storage
existente, prefixo `automation/`.

**Testing**: Vitest. Models com PGlite; motor e executores de bloco com models e integrações
mockados e `vi.useFakeTimers`; integrações de IA com `fetch` mockado; rotas com `app.inject`;
editor e painéis com Testing Library (React Flow renderizado em jsdom com `ResizeObserver`
falso).

**Target Platform**: servidor Linux (backend único) e navegadores desktop. O editor é só desktop;
tablet e celular listam fluxos e ativam/desativam.

**Project Type**: web application (frontend + backend), igual à feature 001

**Performance Goals**: primeira ação ≤5 s após o gatilho p95 (SC-002); resposta do agente ≤15 s
p95 (SC-003), com timeout duro de 30 s no provedor; espera retomada com ±1 min após reinício
(FR-012).

**Constraints**: uma execução ativa por conversa; no máximo 100 blocos por execução; uma instância
do backend (herdado do bus SSE); chaves de IA nunca saem do backend nem aparecem em logs; webhook
da Evolution não pode esperar pela IA.

**Scale/Scope**: dezenas de fluxos, até ~5.000 conversas, execuções na casa de centenas por hora;
histórico de 90 dias. ~6 telas novas (lista de fluxos, editor, execuções, detalhe de execução,
agentes, provedores) e mudanças no chat.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Como o plano cumpre | Status |
|---|---|---|
| I. MVC | **Models** (`backend/src/models/`): `ai-provider`, `ai-agent`, `flow`, `flow-version`, `flow-run` (inclui passos), mais funções novas em `conversation`, `contact`, `message`. **Controllers**: `ai-providers`, `ai-agents`, `flows`, `runs`, `handling` (assumir, devolver, opt-out, passagem para humano), `automation/engine` + `automation/nodes/*` (um executor por bloco), `automation/triggers` (chamado por `messages.receive`), `automation/graph-validation`. **Integrations**: `integrations/ai/{openai,anthropic,gemini,index}.ts`. **Routes**: `ai-providers`, `ai-agents`, `flows`, `runs`, mais rotas novas em `conversations`/`contacts`. **Job**: `jobs/automation-worker.ts` só chama o controller do motor em intervalo. **View**: `frontend/src/app/(painel)/automacoes/...` + `components/automation/*`; nunca acessa banco, só `/api`. | ✅ |
| II. Código limpo | Um arquivo por executor de bloco, cada um uma função `run(ctx, run, node) → NextStep`; nomes e limites como constantes (`MAX_STEPS = 100`, `AGENT_DEBOUNCE_MS`, `PROVIDER_TIMEOUT_MS`); erros de domínio com `DomainError` (`INVALID_FLOW`, `RUN_ALREADY_ACTIVE`, `PROVIDER_IN_USE`…); falhas de bloco nunca engolidas: vão para `flow_run_steps.error` e para o logger. | ✅ |
| III. Testes unitários | `*.test.ts` ao lado de cada model, controller, executor de bloco, validação de grafo e integração de IA. Casos obrigatórios: uma execução por conversa, versões fixas, retomada por lease vencido, 100 passos, debounce do agente, timeout/erro do provedor → humano, opt-out, prioridade entre fluxos, cifragem ida e volta. Frontend: editor (adicionar/conectar/validar), painel de configuração por bloco, indicador de automação e selo "aguardando humano" no chat. Cobertura ≥80% em models/controllers. | ✅ |
| IV. Fronteiras seguras | Zod em todas as rotas novas, no grafo (união discriminada por tipo de bloco) e em **toda resposta de provedor de IA**. Chaves de IA cifradas (AES-256-GCM) com `AI_CREDENTIALS_KEY` só em env do backend; API devolve só `keyHint`; serializer de log não inclui corpo das rotas de provedor. RLS em todas as 6 tabelas novas. Rotas de gestão exigem `requireAdmin` (FR-029). Texto do contato vai ao LLM só como mensagem de usuário, nunca concatenado nas instruções do agente. | ✅ |
| V. Simplicidade | Duas dependências novas, justificadas: `@xyflow/react` (research §1) e `@anthropic-ai/sdk` (research §5). Sem fila externa, sem Redis, sem n8n embutido; OpenAI e Gemini sem SDK. Abstração de provedor de IA tem 3 usos concretos. Sem linguagem de expressão, sem requisição HTTP, sem cron (fora do escopo da spec). | ✅ |

**Re-check pós-design (Phase 1)**: data-model e contratos mantêm as regras acima. O motor ficou
em `controllers/` (orquestra models e integrações, sem acesso direto ao banco) e o laço em
`jobs/`, que é infraestrutura como `realtime/`. Sem violações (constituição v1.1.0).

## Project Structure

### Documentation (this feature)

```text
specs/003-automation-flows-ai-agents/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml      # rotas novas + campos novos de Conversation/Message
│   ├── flow-graph.md     # formato do grafo, tipos de bloco, validação de ativação
│   └── sse-events.md     # run.updated + payloads ampliados
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

Só o que é novo (✚) ou alterado (✎); o resto segue a feature 001.

```text
backend/src/
├── config.ts                         ✎ AI_CREDENTIALS_KEY (32 bytes base64)
├── context.ts                        ✎ AppContext.ai (provedores de IA por vendor; fake nos testes)
├── server.ts                         ✎ inicia/para o automation-worker
├── db/
│   ├── schema.ts                     ✎ enums, 6 tabelas, colunas novas
│   └── migrations/0001_automation.sql ✚ gerada + ENABLE ROW LEVEL SECURITY
├── lib/
│   └── secret-box.ts                 ✚ AES-256-GCM encrypt/decrypt (node:crypto)
├── models/
│   ├── ai-provider.ts                ✚
│   ├── ai-agent.ts                   ✚
│   ├── flow.ts                       ✚ flows + flow_versions
│   ├── flow-run.ts                   ✚ runs + steps, claimDue (SKIP LOCKED), retenção
│   ├── conversation.ts               ✎ handling (handoff, assume, release), filtro awaiting_human
│   ├── contact.ts                    ✎ opt-out
│   └── message.ts                    ✎ flow_run_id / ai_agent_id, histórico para o agente
├── controllers/
│   ├── dto.ts                        ✎ Conversation.handling, Message.automation, DTOs novos
│   ├── messages.ts                   ✎ receive → triggers; sendText/sendMedia → assume;
│   │                                   envio compartilhado com o motor
│   ├── ai-providers.ts               ✚
│   ├── ai-agents.ts                  ✚
│   ├── flows.ts                      ✚ CRUD, salvar versão, ativar/desativar, duplicar, testar
│   ├── runs.ts                       ✚ histórico, detalhe, cancelar, disparo manual
│   ├── handling.ts                   ✚ handoff, assumir, devolver, opt-out
│   └── automation/
│       ├── engine.ts                 ✚ start, advance, resume, cancel, tick
│       ├── triggers.ts               ✚ inbound → retomar ou iniciar (research §4, §9)
│       ├── graph-schema.ts           ✚ Zod do grafo (contracts/flow-graph.md)
│       ├── graph-validation.ts       ✚ regras de ativação (FR-006)
│       ├── variables.ts              ✚ {{contato.*}}
│       └── nodes/                    ✚ send-text, send-media, wait, wait-reply, condition,
│                                       ai-agent, handoff, end
├── integrations/ai/
│   ├── index.ts                      ✚ interface comum + registro por vendor
│   ├── openai.ts / anthropic.ts / gemini.ts  ✚ fetch + Zod
│   └── tools.ts                      ✚ transferir_para_humano / encerrar_atendimento
├── jobs/
│   └── automation-worker.ts          ✚ setInterval 5 s → engine.tick; retenção a cada hora
├── realtime/bus.ts                   ✎ evento run.updated
└── routes/
    ├── ai-providers.ts / ai-agents.ts / flows.ts / runs.ts  ✚
    ├── conversations.ts              ✎ handling filter, start-flow, assume, release, runs
    └── contacts.ts                   ✚ automation-opt-out

frontend/src/
├── app/(painel)/
│   ├── automacoes/page.tsx                    ✚ lista de fluxos (status, gatilho, prioridade)
│   ├── automacoes/[id]/page.tsx               ✚ editor
│   ├── automacoes/[id]/execucoes/page.tsx     ✚ histórico
│   ├── automacoes/execucoes/[runId]/page.tsx  ✚ detalhe com caminho destacado
│   ├── automacoes/agentes/page.tsx            ✚
│   ├── automacoes/provedores/page.tsx         ✚
│   └── chat/page.tsx                          ✎ filtro "aguardando humano"
├── components/
│   ├── automation/
│   │   ├── flow-editor.tsx            ✚ React Flow + paleta + salvar/ativar/testar
│   │   ├── node-types/*.tsx           ✚ um nó visual por tipo de bloco
│   │   ├── node-config-panel.tsx      ✚ formulário do bloco selecionado
│   │   ├── run-path-view.tsx          ✚ grafo somente leitura com passos
│   │   ├── agent-form.tsx / provider-form.tsx  ✚
│   └── chat/
│       ├── handoff-banner.tsx         ✚ motivo, resumo, assumir/devolver
│       ├── automation-indicator.tsx   ✚ "automação em andamento" + parar
│       ├── start-flow-menu.tsx        ✚ fluxos manuais + nova conversa por número
│       ├── message-bubble.tsx         ✎ rótulo "Automação:"/"IA:"
│       └── conversation-list.tsx      ✎ selo "aguardando humano"
├── components/panel-nav.tsx           ✎ item Automações (só admin)
└── lib/
    ├── use-automation.ts              ✚ queries/mutações de fluxos, agentes, provedores, runs
    ├── use-events.ts / chat-cache.ts  ✎ run.updated, campos novos
    └── types.ts                       ✎ tipos do contrato
```

**Structure Decision**: mesma aplicação web em npm workspaces da feature 001. O motor de
automação é um conjunto de controllers (`controllers/automation/`); o único código fora do MVC
clássico é `jobs/automation-worker.ts`, um temporizador fino que chama o controller, no mesmo
papel que `realtime/` tem para o SSE.

## Complexity Tracking

Sem violações da constituição a justificar.
