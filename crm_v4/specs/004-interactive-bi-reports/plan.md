# Implementation Plan: Relatórios de BI Interativos

**Branch**: `004-interactive-bi-reports` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-interactive-bi-reports/spec.md`

## Summary

Área **Relatórios** no CRM: editor de arrastar e soltar em grade com componentes prontos
(indicador, barras, colunas, linha, área, pizza/rosca, funil, tabela, tabela dinâmica, filtros,
texto) que se adaptam ao tipo dos campos, filtragem cruzada, detalhamento de datas, várias
páginas, compartilhamento e exportação. Dados vêm das tabelas do próprio CRM (fontes internas) e
de fontes externas: planilha (arquivo ou link), PostgreSQL/MySQL em modo leitura e APIs JSON.

Abordagem: fontes externas são **copiadas** para o Postgres do CRM em capturas (`jsonb`
normalizado), atualizadas manual ou periodicamente por um agendador no backend. Todo componente
vira uma consulta agregada gerada por um único compilador (componente → SQL parametrizado) que
roda no Postgres, sobre a captura ou sobre um SELECT fixo das tabelas internas. A definição do
relatório (páginas, componentes, layout, filtros, campos calculados) é um documento `jsonb`
validado por Zod. No navegador: `react-grid-layout` para a grade, DnD nativo para campos e
ECharts para os gráficos.

## Technical Context

**Language/Version**: TypeScript 6 (strict) em Node.js 22 LTS (igual à feature 001)

**Primary Dependencies**:
- Backend (existentes): Fastify 5, `@fastify/multipart`, Zod 4, Drizzle ORM + `postgres`
- Backend (novas): `mysql2` (MySQL externo), `exceljs` (.xlsx em streaming), `csv-parse` (CSV)
- Frontend (existentes): Next.js 16, React 19, Tailwind 4, TanStack Query 5
- Frontend (novas): `react-grid-layout` 2 (grade), `echarts` 6 (gráficos), `html-to-image` (PNG)

**Storage**: PostgreSQL (local/Supabase): tabelas `bi_sources`, `bi_snapshots`,
`bi_snapshot_rows`, `bi_relationships`, `reports`, `report_shares`. Planilhas enviadas guardadas
pelo `storage` existente (local/Supabase Storage) para reprocessamento.

**Testing**: Vitest. Models com PGlite (`createTestDb()`), incluindo o compilador de consultas
executado de verdade contra PGlite; controllers com `vi.mock` dos models e `fakeContext()`;
conectores com servidores fake (`fetch` mockado, PGlite para o conector Postgres, `mysql2`
mockado); rotas com `buildTestApp()`; frontend com Testing Library (`renderWithClient`,
`mockApi`), ECharts mockado nos testes de componente.

**Target Platform**: servidor Linux; navegadores desktop para edição; tablet/celular só leitura.

**Project Type**: web application (frontend + backend), mesmo monorepo da feature 001.

**Performance Goals**: componente desenhado e filtro refletido em ≤ 3 s p95 com fonte de 500.000
linhas (SC-002); prévia de fonte em < 3 min de ponta a ponta (SC-003).

**Constraints**: backend em instância única (agendador e bus em memória); consultas e conectores
com timeout de 30 s; planilha ≤ 50 MB e ≤ 500.000 linhas; API ≤ 50 páginas e ≤ 20 MB por
página; fontes externas somente leitura; hosts privados bloqueados em produção (SSRF);
datas no fuso America/Sao_Paulo.

**Scale/Scope**: ~20 usuários, dezenas de relatórios, ~30 fontes externas; ~5 telas novas
(lista de relatórios, editor/visualizador, lista de fontes, assistente de fonte, relacionamentos).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Como o plano cumpre | Status |
|---|---|---|
| I. MVC | Models em `backend/src/models/bi/` (sources, snapshots, relationships, reports, shares, query-compiler, expression, type-inference, internal-sources, definition): único código que monta SQL e toca o banco do CRM. Controllers em `backend/src/controllers/bi-*.ts` orquestram (permissão, testar conexão, ingestão, sugestão). Conectores externos em `backend/src/integrations/bi-connectors/` (csv, xlsx, google-sheets, postgres, mysql, http-api, network-guard). Rotas `backend/src/routes/bi-*.ts` só validam com Zod e chamam controller. View em `frontend/src/app/(painel)/relatorios/` e `fontes/`, dados só via `/api/bi/*`. | ✅ |
| II. Código limpo | Compilador, parser de expressões e inferência de tipos como funções puras pequenas; erros como `DomainError` com códigos listados no contrato; constantes nomeadas para limites (50 MB, 500.000, 30 s, 50 páginas, 20 itens). | ✅ |
| III. Testes unitários | `*.test.ts` para cada model/controller/conector; compilador testado contra PGlite (injeção, fuso, Top N + Outros, filtros por relacionamento); inferência de tipos com tabela de casos pt-BR; componentes com lógica (slots, montagem da consulta, filtragem cruzada, desfazer/refazer, pivot, formulário de fonte) com Testing Library; cobertura ≥ 80%. | ✅ |
| IV. Fronteiras seguras | Zod em todas as rotas, em `ReportDefinition` e em cada `config` de fonte; respostas de APIs externas e linhas de bancos externos tratadas como dados não confiáveis (normalizadas por tipo, nunca interpoladas em SQL); campos só entram no SQL por lista permitida; credenciais cifradas (AES-256-GCM, `BI_SECRETS_KEY` só no backend) e mascaradas; bancos externos em transação read-only; bloqueio SSRF; RLS em todas as tabelas novas; apenas admin gerencia fontes. | ✅ |
| V. Simplicidade | Capturas numa tabela `jsonb` genérica em vez de DDL dinâmico; definição do relatório num `jsonb` em vez de tabelas por página/componente; agendador `setInterval` em vez de fila; DnD nativo; PDF pela impressão do navegador; CSV em vez de .xlsx no "ver dados". Seis dependências novas, cada uma justificada em research.md. | ✅ |

**Re-check pós-design (Phase 1)**: data-model e contratos mantêm as regras acima. ✅ Sem violações
(constituição v1.1.0). Ponto de atenção registrado: desempenho do `jsonb` a 500.000 linhas
(research §1) com plano B definido, sem mudar contratos.

## Project Structure

### Documentation (this feature)

```text
specs/004-interactive-bi-reports/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml            # endpoints /api/bi/*
│   └── report-definition.md    # slots por componente, montagem da consulta, filtragem cruzada
├── checklists/requirements.md
└── tasks.md                    # /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── config.ts                         # + BI_SECRETS_KEY, BI_ALLOW_PRIVATE_NETWORKS
│   ├── context.ts                        # + biConnectors no AppContext
│   ├── server.ts                         # + agendador de atualização (setInterval 60 s)
│   ├── db/schema.ts, migrations/0001_bi.sql (+ RLS)
│   ├── lib/crypto.ts                     # encryptSecrets / decryptSecrets / maskSecret
│   ├── models/bi/
│   │   ├── definition.ts                 # Zod ReportDefinition
│   │   ├── internal-sources.ts           # SELECTs fixos (whatsapp_conversations, whatsapp_messages)
│   │   ├── type-inference.ts             # inferFieldType, normalizeValue (pt-BR)
│   │   ├── expression.ts                 # parser de campos calculados → SQL
│   │   ├── query-compiler.ts             # QueryRequest → SQL (Top N, filtros, joins, fuso)
│   │   ├── suggestions.ts                # componente sugerido, relatório sugerido
│   │   ├── templates.ts                  # modelo "Atendimento WhatsApp"
│   │   ├── source.ts  snapshot.ts  relationship.ts  report.ts  share.ts
│   ├── controllers/
│   │   ├── bi-sources.ts                 # preview, create, update, delete, refresh, runDueRefreshes
│   │   ├── bi-query.ts                   # query, rows, rowsCsv, suggest
│   │   ├── bi-reports.ts                 # CRUD, duplicar, modelo, conflito, compartilhar
│   │   └── dto.ts                        # + toSourceDto, toReportDto…
│   ├── integrations/bi-connectors/
│   │   ├── index.ts                      # readSource(kind, config, secrets) → AsyncIterable
│   │   ├── network-guard.ts              # BlockList + dns.lookup + redirects
│   │   ├── csv.ts  xlsx.ts  google-sheets.ts  postgres.ts  mysql.ts  http-api.ts
│   └── routes/bi-sources.ts  bi-query.ts  bi-reports.ts
└── scripts/seed-bi-perf.ts               # 500.000 linhas (db:seed:bi)

frontend/
└── src/
    ├── app/(painel)/
    │   ├── relatorios/page.tsx            # lista + novo (vazio/modelo/duplicar)
    │   ├── relatorios/[id]/page.tsx       # editor/visualizador (modo por permissão e largura)
    │   └── fontes/page.tsx, fontes/nova/page.tsx, fontes/[id]/page.tsx
    ├── components/bi/
    │   ├── report-editor.tsx              # layout: paleta | tela | painel de campos/propriedades
    │   ├── report-canvas.tsx              # react-grid-layout + drop de campo/componente
    │   ├── visual-frame.tsx               # título, menu, ver dados, estados vazio/erro/aviso
    │   ├── visuals/echart-visual.tsx  kpi-visual.tsx  table-visual.tsx  pivot-visual.tsx
    │   │   filter-list-visual.tsx  filter-date-visual.tsx  text-visual.tsx
    │   ├── field-list.tsx  slot-well.tsx  visual-properties.tsx  page-tabs.tsx
    │   ├── filter-trail.tsx  data-rows-dialog.tsx  share-dialog.tsx  export-menu.tsx
    │   └── source-form/ (kind-picker, spreadsheet, database, api, preview-table, field-types)
    ├── lib/bi/
    │   ├── editor-reducer.ts              # definição + histórico desfazer/refazer (20)
    │   ├── build-query.ts                 # visual + filtros + view state → QueryRequest
    │   ├── view-state.ts                  # crossFilter, drill, overrides
    │   ├── slots.ts                       # regras de slots e sugestões (espelha contrato)
    │   ├── echarts-options.ts             # QueryResult → option ECharts (tema V4)
    │   └── use-bi.ts                      # hooks TanStack Query
    └── components/panel-nav.tsx           # + Relatórios, Fontes de dados (admin)
```

**Structure Decision**: mesma aplicação web da feature 001 (npm workspaces `backend/` e
`frontend/`); nenhum app ou pacote novo. Código de BI agrupado em `models/bi/`,
`integrations/bi-connectors/`, `components/bi/` e `lib/bi/` para não misturar com o chat.

## Complexity Tracking

Sem violações da constituição a justificar.
