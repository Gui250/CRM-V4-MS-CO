# Data Model: Disparo de Fluxos pelo Painel da Conversa

Nenhuma entidade, tabela ou coluna nova. A feature lê e escreve só pelos endpoints da feature
003 (ver [contracts/ui-contract.md](./contracts/ui-contract.md)). O que existe de "modelo" aqui é
o estado do seletor no frontend.

## Entradas (já em cache no cliente)

| Dado | Origem | Uso |
|---|---|---|
| `connection.status` | `useConnection()` (`['connection']`) | `connected` libera o disparo |
| `conversation.contact` (`id`, `name`, `phone`) | cache `['conversations', …]` | confirmação e opt-in |
| `conversation.automationOptOut` | idem | estado `opted_out` |
| `conversation.handling.mode` | idem | aviso "volta ao modo automação" |
| `runs` (`RunSummary[]`, ativa primeiro) | `useConversationRuns(id)`, mantido pelo SSE `run.updated` | estado `running` |
| `flows` (`FlowSummary[]`, só `status=active`) | `useStartableFlows()` montado quando aberto | lista |
| `me.role` | `useMe()` | atalho para Automações no estado `empty` |

## Estados do seletor (função pura `pickerState`)

Precedência de cima para baixo; o primeiro que casar vence.

| Estado | Condição | O que mostra |
|---|---|---|
| `disconnected` | `connection.status !== 'connected'` | "O WhatsApp está desconectado. Conecte o número para disparar automações." + link `/conexao` |
| `opted_out` | `conversation.automationOptOut` | "Este contato pediu para não receber mensagens automáticas." + botão "Permitir automação" |
| `running` | `runs[0]` com `status` em `running`/`waiting` | "Automação em andamento: **{flowName}**" + botão "Parar" |
| `loading` | `flows` ainda não carregou (sem cache) | "Carregando…" |
| `empty` | `flows.length === 0` | "Nenhum fluxo ativo." + (admin) link "Ir para Automações" `/automacoes` |
| `list` | caso contrário | busca (se `≥ SEARCH_THRESHOLD`) + itens ordenados por nome |

## Transições da interação

```text
closed ──clique/Enter/Espaço no ícone──▶ open(state)
open(*) ──Esc / clique fora / troca de conversa──▶ closed (nada disparado)
open(list) ──escolhe fluxo──▶ confirm(flow)
confirm ──Cancelar──▶ open(list)
confirm ──Confirmar──▶ starting ──201──▶ closed  (SSE run.updated liga o indicador)
                                └──erro──▶ confirm + alert (mensagem do DomainError)
                                            └─ FLOW_NOT_STARTABLE: invalida ['flows'] e volta a open(list)
open(running) ──Parar──▶ cancel run ──200──▶ open(list)   (runs[0] deixa de estar ativa)
open(opted_out) ──Permitir automação──▶ DELETE opt-out ──▶ open(list | running)
```

Regras:

- `confirm` e `starting` são um único passo visual; `Confirmar` fica desabilitado enquanto a
  mutação está pendente (uma execução por clique, SC-004).
- Trocar de conversa desmonta o picker (`key={conversationId}` já usado no `Composer`), então o
  estado volta a `closed` sem lógica extra.
- Só uma automação ativa por conversa (regra do backend): por isso `running` substitui a lista
  em vez de marcar um item.

## Validação

Sem entrada livre além da busca, que só filtra no cliente. O `flowId` enviado vem sempre da
lista devolvida pela API; a validação de negócio continua no backend (`FLOW_NOT_STARTABLE`,
`CONTACT_OPTED_OUT`, `WHATSAPP_DISCONNECTED`, `RUN_ALREADY_ACTIVE`).
