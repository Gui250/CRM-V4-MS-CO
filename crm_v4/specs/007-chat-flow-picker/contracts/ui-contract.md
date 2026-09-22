# Contracts: Disparo de Fluxos pelo Painel da Conversa

## API (sem mudanças)

Todos os endpoints já existem e estão descritos em
`specs/003-automation-flows-ai-agents/contracts/openapi.yaml`. Esta feature não adiciona, altera
nem remove nenhum. Os usados:

| Endpoint | Quando o picker chama | Erros tratados no picker |
|---|---|---|
| `GET /api/flows?status=active` | ao abrir (query montada só enquanto aberto) | rede/5xx → "Não foi possível carregar os fluxos." com "Tentar de novo" |
| `POST /api/conversations/{id}/start-flow` `{ flowId }` | ao confirmar | `FLOW_NOT_STARTABLE` 422, `CONTACT_OPTED_OUT` 409, `WHATSAPP_DISCONNECTED` 409, `RUN_ALREADY_ACTIVE` 409 → `message` em `role="alert"`; `FLOW_NOT_STARTABLE` também invalida `['flows']` |
| `GET /api/conversations/{id}/runs` | já montado pelo `AutomationIndicator`; o picker lê o mesmo cache | — |
| `POST /api/runs/{id}/cancel` | "Parar" no estado `running` | `RUN_FINISHED` 409 → mensagem |
| `DELETE /api/contacts/{id}/automation-opt-out` | "Permitir automação" no estado `opted_out` | mensagem do erro |
| `GET /api/auth/me` | já em cache (`useMe`) | — |
| `GET /api/connection` | já em cache (`useConnection`) | — |

SSE: `run.updated` (feature 003) continua sendo o que liga o indicador "automação em andamento"
e o que tira o picker do estado `running` após "Parar".

## Contrato de UI

### `FlowPicker` (`frontend/src/components/chat/flow-picker.tsx`)

```ts
interface FlowPickerProps {
  conversation: Conversation   // id, contact, handling, automationOptOut
  isConnected: boolean
}
```

Acessibilidade e semântica (verificadas por teste):

| Elemento | Papel / atributos |
|---|---|
| Botão do ícone | `<button type="button" aria-label="Disparar fluxo" title="Disparar fluxo" aria-haspopup="menu" aria-expanded aria-controls>`; sempre habilitado |
| Painel | `role="menu"` no estado `list`; `role="dialog" aria-label="Disparar fluxo"` nos demais estados; `absolute bottom-full` (abre para cima, acima da barra de envio), largura `w-80 max-w-[calc(100vw-2rem)]`, lista com `max-h-72 overflow-y-auto` |
| Busca | `<input type="search" aria-label="Buscar fluxo">`, só com ≥ 10 fluxos |
| Item | `<button role="menuitem">` com nome (negrito) e descrição (muted) |
| Confirmação | texto "Disparar **{nome do fluxo}** para **{nome ou telefone}**?", aviso opcional "A conversa volta para o modo automação.", botões "Confirmar" (primary) e "Cancelar" (ghost) |
| Erro | `<p role="alert">` com a mensagem pt-BR do backend |
| Estados bloqueados | texto explicativo + ação: link "Conectar WhatsApp" (`/conexao`), botão "Permitir automação", botão "Parar", link "Ir para Automações" (`/automacoes`, só admin) |

Teclado: Tab alcança o ícone; Enter/Espaço abre; setas percorrem os `menuitem`; Enter escolhe;
Esc fecha e devolve o foco ao ícone; clique fora fecha.

### `Composer` (`frontend/src/components/chat/composer.tsx`)

Nova prop opcional `leading?: ReactNode`, renderizada como primeiro filho da linha
`flex items-end gap-2`, antes do botão de anexo. Sem outra mudança de comportamento.

### `useHandlingAction` (`frontend/src/components/chat/handoff-banner.tsx`)

Passa a ser exportado. Assinatura inalterada:
`useHandlingAction(conversationId, contactId) → UseMutationResult<…, Action> & { error: string | null }`.

### `usePopup` (`frontend/src/lib/use-popup.ts`)

```ts
function usePopup(): {
  open: boolean
  setOpen: (open: boolean) => void
  rootRef: RefObject<HTMLDivElement | null>
  buttonRef: RefObject<HTMLButtonElement | null>
  dismiss: () => void                       // fecha e devolve o foco ao botão
  onKeyDown: (e: KeyboardEvent) => void     // Esc → dismiss; setas → move foco entre menuitems
}
```

Extraído de `components/bi/menu.tsx`, que pode passar a consumi-lo sem mudança de comportamento.

### Remoções

- `components/chat/start-flow-menu.tsx` e `start-flow-menu.test.tsx`.
- O `<div className="ml-auto shrink-0">` com `StartFlowMenu` no `<header>` de `chat/page.tsx`.
