# Eventos SSE novos — Funis e Pipelines

Enviados no stream existente `GET /api/events` (ver
`specs/001-whatsapp-chat-panel/contracts/sse-events.md`), mesmo formato
`event: <type>\ndata: <json>\n\n`, para todos os usuários logados (regra "todos veem tudo").

| Evento | `data` | Quando | O cliente faz |
|---|---|---|---|
| `lead.upserted` | `{ lead: Lead, previous: { stageId, valueCents } \| null }` (`previous` = estado antes da mudança; `null` = lead criado) | lead criado (manual ou entrada automática), editado, movido ou reordenado; também uma vez por lead remanejado na exclusão de etapa | remove o cartão de onde estiver no cache do quadro e insere na etapa `lead.stageId` pela `position`; ajusta `leadCount`/`valueTotalCents` das colunas afetadas; atualiza a lista de leads do contato no chat |
| `lead.deleted` | `{ leadId, pipelineId, stageId, contactId, valueCents }` | lead excluído | remove o cartão e ajusta a coluna; atualiza leads do contato |
| `pipeline.changed` | `{ pipelineId }` | funil criado, renomeado, arquivado/reativado, funil de entrada mudou, etapa criada/editada/reordenada/excluída | invalida `['pipelines']` e `['board', pipelineId, …]` (refaz as queries) |

`Lead` segue o schema de `contracts/openapi.yaml`.

Regras:
- Contagens e somas são ajustadas no cliente com `previous` (sai da etapa antiga, entra na nova),
  exatas sem filtro mesmo para cartões ainda não carregados. Se o cartão já está na etapa de
  destino no cache (ex.: o movimento otimista do próprio usuário), só o cartão é substituído, sem
  contar duas vezes.
- Filtros do quadro (responsável, busca) são aplicados no cliente ao receber `lead.upserted`: se o
  lead não bate com o filtro atual, ele sai da coluna. Com filtro ativo, um cartão não carregado
  pode deixar a contagem divergir até o próximo refetch.
- `message.created` (da 001) continua atualizando `unreadCount` da conversa; o cliente aplica o
  novo `unreadCount` aos cartões com o mesmo `conversationId`, sem evento de lead extra.
- Ao reconectar o SSE, o cliente invalida as queries de funis e quadros (mesmo comportamento da
  001 para conversas).
