# Implementation Plan: Disparo de Fluxos pelo Painel da Conversa

**Branch**: `007-chat-flow-picker` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-chat-flow-picker/spec.md`

## Summary

Trocar o botão de texto "Automações" do cabeçalho da conversa por um ícone "Disparar fluxo" na
barra de envio (ao lado do anexo), que abre um seletor de fluxos ativos com busca, confirmação e
estados explicados (WhatsApp desconectado, contato que não quer automação, automação em
andamento, nenhum fluxo). Mudança **só de frontend**: o backend da feature 003 já expõe
`GET /api/flows?status=active`, `POST /api/conversations/{id}/start-flow`,
`GET /api/conversations/{id}/runs` e `POST /api/runs/{id}/cancel`, e já aplica todas as regras
(fluxo ativo, opt-out, desconexão, uma execução por conversa). Nenhuma tabela, rota, contrato ou
dependência nova.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Next.js 16 App Router, React 19 (feature 001)

**Primary Dependencies**: TanStack Query 5, Tailwind 4, Testing Library + Vitest. **Nenhuma
nova**; o ícone é um SVG inline (research §2).

**Storage**: N/A (nenhuma mudança de banco)

**Testing**: Vitest + Testing Library com `renderWithClient` e `mockApi`
(`frontend/src/test/render.tsx`)

**Target Platform**: navegadores desktop e celular (o seletor precisa caber em telas estreitas)

**Project Type**: web application; esta feature toca só `frontend/`

**Performance Goals**: seletor abre com a lista em cache ou em ≤1 s na primeira vez; indicador
"em andamento" ≤2 s após confirmar (SC-003, já garantido pelo SSE `run.updated` da feature 003)

**Constraints**: uma execução ativa por conversa (`RUN_ALREADY_ACTIVE`, feature 003); atendentes
só podem listar `status=active` (`GET /api/flows` recusa outros filtros para não-admin); sem nova
dependência (constituição V); contraste AA nos tokens já existentes

**Scale/Scope**: 1 componente novo (`flow-picker`), 1 hook compartilhado pequeno, 3 arquivos
editados (`composer`, `chat/page`, `handoff-banner`), 2 arquivos removidos (`start-flow-menu` e
seu teste). Dezenas de fluxos ativos no máximo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Como o plano cumpre | Status |
|---|---|---|
| I. MVC | Só **View**. `frontend/src/components/chat/flow-picker.tsx` (novo), `frontend/src/lib/use-popup.ts` (novo, teclado e clique fora), edições em `components/chat/composer.tsx` (slot `leading`), `app/(painel)/chat/page.tsx` (remove `StartFlowMenu`, passa o picker ao `Composer`) e `components/chat/handoff-banner.tsx` (exporta `useHandlingAction`). Dados só via `/api` com os hooks já existentes em `lib/use-automation.ts`. Nenhum model, controller ou rota muda. | ✅ |
| II. Código limpo | Constantes nomeadas (`SEARCH_THRESHOLD = 10`); um componente principal por arquivo; estados do seletor derivados por uma função pura `pickerState(...)` testável (data-model.md); erros de API mostrados com a mensagem pt-BR do `DomainError`, nunca engolidos. | ✅ |
| III. Testes unitários | `flow-picker.test.tsx` cobre todos os estados e o disparo (quickstart §3); `use-popup.test.ts` cobre Esc, clique fora e setas; `composer.test.tsx` ganha um caso para o slot `leading`; `start-flow-menu.test.tsx` é removido junto com o componente. Backend intocado, cobertura ≥80% mantida. | ✅ |
| IV. Fronteiras seguras | Sem entrada nova no backend. O frontend continua usando só `status=active` (único filtro permitido a atendentes, FR-029 da 003). Nenhum segredo, nenhuma tabela. | ✅ |
| V. Simplicidade | Zero dependências novas: SVG inline em vez de lib de ícones; hook `use-popup` tem dois usos concretos (picker e `bi/menu.tsx`), o que justifica a abstração; sem estado global, sem contexto React, sem store. Reaproveita `useStartableFlows`, `useStartFlow`, `useConversationRuns`, `useCancelRun`, `useConnection`, `useMe` e `useHandlingAction`. | ✅ |

**Re-check pós-design (Phase 1)**: data-model e contrato de UI mantêm as regras acima. Nenhuma
violação; seção Complexity Tracking vazia.

## Project Structure

### Documentation (this feature)

```text
specs/007-chat-flow-picker/
├── plan.md              # este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1: estados do seletor (sem entidade nova)
├── quickstart.md        # Phase 1: validação manual e automatizada
├── contracts/
│   └── ui-contract.md   # Phase 1: contrato de UI e endpoints reutilizados da 003
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (não criado aqui)
```

### Source Code (repository root)

```text
frontend/src/
├── app/(painel)/chat/page.tsx                 # edita: remove StartFlowMenu do header,
│                                              #        passa <FlowPicker> ao Composer
├── components/chat/
│   ├── composer.tsx                           # edita: prop `leading?: ReactNode` na linha de envio
│   ├── composer.test.tsx                      # edita: caso "renderiza o slot leading"
│   ├── flow-picker.tsx                        # NOVO: ícone + seletor (substitui start-flow-menu)
│   ├── flow-picker.test.tsx                   # NOVO
│   ├── handoff-banner.tsx                     # edita: `export` em useHandlingAction
│   ├── start-flow-menu.tsx                    # REMOVE
│   └── start-flow-menu.test.tsx               # REMOVE
├── components/bi/menu.tsx                     # edita (opcional): passa a usar use-popup
└── lib/
    ├── use-popup.ts                           # NOVO: abrir/fechar, Esc, clique fora, setas
    └── use-popup.test.ts                      # NOVO

backend/                                       # sem mudanças
```

**Structure Decision**: estrutura web existente (feature 001). A feature vive inteira em
`frontend/src/components/chat/` e `frontend/src/lib/`, no mesmo padrão dos componentes do chat
já presentes (`automation-indicator`, `handoff-banner`).

## Complexity Tracking

Sem violações da constituição; nada a justificar.
