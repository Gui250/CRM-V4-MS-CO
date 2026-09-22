# Contrato: eventos em tempo real (SSE)

`GET /api/events`, `Content-Type: text/event-stream`. Exige sessão válida (401 caso contrário).
Cada evento tem `event: <nome>` e `data: <JSON>`. Todos os atendentes ativos recebem todos os
eventos (FR-013). Comentário `: ping` a cada 25 s mantém a conexão viva através de proxies.

Sem replay: ao reconectar (`EventSource` faz isso sozinho), o frontend invalida as queries de
conversas, da conversa aberta e da conexão, e recarrega pela API REST.

| Evento | Quando | `data` |
|---|---|---|
| `message.created` | mensagem recebida, enviada pelo painel (pending) ou pelo celular | `{ message: Message, conversation: Conversation }` |
| `message.updated` | mudança de status (sent/delivered/read/failed) ou mídia salva | `{ message: Message }` |
| `conversation.updated` | unread zerado, preview/horário alterados | `{ conversation: Conversation }` |
| `connection.updated` | status da conexão ou novo QR Code | `{ connection: Connection }` |

`Message`, `Conversation` e `Connection` seguem os schemas de [openapi.yaml](./openapi.yaml).

Evento `connection.updated` com `status: "disconnected"` dispara o aviso de desconexão em todas as
telas (spec, US2 cenário 3).
