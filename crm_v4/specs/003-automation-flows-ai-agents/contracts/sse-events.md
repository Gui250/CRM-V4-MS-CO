# Contrato: eventos em tempo real (acréscimos)

Estende [../../001-whatsapp-chat-panel/contracts/sse-events.md](../../001-whatsapp-chat-panel/contracts/sse-events.md).
Mesmo endpoint (`GET /api/events`), mesma regra: todos os usuários ativos recebem todos os
eventos, e no reconnect o frontend invalida as queries.

## Eventos existentes com payload ampliado

| Evento | Mudança |
|---|---|
| `message.created` / `message.updated` | `Message` ganha `automation: { kind: "flow" \| "agent", name: string } \| null` |
| `conversation.updated` | `Conversation` ganha `handling` (ver `Handling` no [openapi.yaml](./openapi.yaml)) e `automationOptOut: boolean`. Publicado também em toda passagem para humano, "assumir", "devolver" e opt-out |

## Evento novo

| Evento | Quando | `data` |
|---|---|---|
| `run.updated` | execução criada, mudou de situação ou terminou um bloco | `{ run: RunSummary }` |

`RunSummary` segue o schema do openapi: `id`, `flowId`, `flowName`, `conversationId`, `status`,
`currentNodeId`, `isTest`, `startedAt`, `finishedAt`, `endReason`.

Uso no frontend:

- chat: `status` em `running`/`waiting` na conversa aberta → indicador "automação em andamento"
  com botão "parar" (US4 cenário 2); terminal → remove o indicador;
- editor em modo teste: destaca `currentNodeId` e busca `GET /api/runs/{id}` para os passos
  (US5 cenário 3);
- histórico de execuções: invalida `['runs', flowId]`.
