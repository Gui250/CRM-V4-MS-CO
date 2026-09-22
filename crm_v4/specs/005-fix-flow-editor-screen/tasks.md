# Tasks: Tela de edição do fluxo de automação

**Input**: [spec.md](spec.md), [plan.md](plan.md); comportamento do editor herdado da feature 003
(`specs/003-automation-flows-ai-agents/tasks.md` T041, T042).

## Phase 1: Editor (US1 + US2)

- [ ] T001 [US2] Write `frontend/src/components/automation/flow-editor.test.tsx`: renders saved
  blocks and edges; palette click adds a block and selects it; config panel edits the selected
  block; "Salvar" sends the graph to `PUT /api/flows/:id/graph`; 422 `INVALID_FLOW` highlights
  the node and shows graph-level issues; "Ativar" saves then posts to `/activate` and shows
  "Ativo"; "Desativar" posts to `/deactivate`; read-only mode hides palette/save and keeps
  Ativar/Desativar
- [ ] T002 [US2] Implement `frontend/src/components/automation/flow-editor.tsx` per plan.md
  Design (depends on T001)

## Phase 2: Page (US1 + US3)

- [ ] T003 [US1] Write `frontend/src/app/(painel)/automacoes/[id]/page.test.tsx`: loads the flow
  and shows the editor with its name and status; 404 → "Fluxo não encontrado" with link to
  `/automacoes`; non-admin → restricted notice; narrow screen → read-only notice
- [ ] T004 [US1] Implement `frontend/src/app/(painel)/automacoes/[id]/page.tsx` (depends on
  T002, T003)

## Phase 3: Validation

- [ ] T005 `npm test -w frontend`, `npm run typecheck`, `npm run lint` green; mark T041/T042 as
  done in `specs/003-automation-flows-ai-agents/tasks.md`
