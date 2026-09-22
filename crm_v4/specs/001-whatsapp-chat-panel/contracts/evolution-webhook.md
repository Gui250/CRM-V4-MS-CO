# Contrato: webhook da Evolution API (entrada)

`POST /api/webhooks/evolution?token=<EVOLUTION_WEBHOOK_TOKEN>`

- Token comparado em tempo constante; inválido → 401, nada é processado.
- Body validado com Zod; campos desconhecidos ignorados; evento de outra instância ou não listado →
  200 sem efeito (a Evolution não deve reenviar).
- Sempre responde 200 rápido depois de persistir. Falhas de download de mídia não derrubam o
  webhook: a mensagem fica salva sem `media_path` e o download é refeito na próxima leitura.
- Idempotente: `wa_message_id` único; evento repetido não duplica mensagem nem incrementa unread.

Configurado pelo backend em `POST /webhook/set/{instance}` com `webhook_by_events: false` e os
eventos abaixo.

Eventos não tratados, inclusive `MESSAGES_SET` (histórico da sincronização inicial), são
ignorados: mensagens anteriores à conexão não são importadas nesta versão (spec, Assumptions).

Respostas das chamadas feitas à Evolution (QR, `key.id`, base64 de mídia, foto de perfil) também
são validadas com Zod (`integrations/evolution/response-schemas.ts`); resposta inválida vira
`EVOLUTION_UNAVAILABLE`.

## Eventos tratados

Envelope comum: `{ event: string, instance: string, data: object, date_time?: string }`.

### `QRCODE_UPDATED`
`data.qrcode.base64` → `whatsapp_connection.last_qr`, status `awaiting_qr`; emite
`connection.updated`.

### `CONNECTION_UPDATE`
`data.state`: `open` → `connected` (grava número do `wuid`, limpa QR); `close` → `disconnected`;
`connecting` → sem mudança. Emite `connection.updated`.

### `MESSAGES_UPSERT`
Campos usados: `data.key.remoteJid`, `data.key.fromMe`, `data.key.id`, `data.pushName`,
`data.message` (conteúdo), `data.messageType`, `data.messageTimestamp`.

- Descarta `remoteJid` terminando em `@g.us`, `@broadcast` ou `@newsletter` (FR-014).
- Faz upsert de contato (atualiza `name` com `pushName` só quando `fromMe=false`) e conversa.
  Contato novo: busca a foto em `POST /chat/fetchProfilePictureUrl/{instance}`; falha → sem foto.
- Mapeamento de tipo: `conversation`/`extendedTextMessage` → `text`; `imageMessage` → `image`;
  `audioMessage` → `audio`; `videoMessage` → `video`; `documentMessage` → `document`;
  demais (sticker, location, contact, poll…) → `unsupported`.
- `fromMe=true` → `outbound`. Se já existe mensagem com o mesmo `wa_message_id` (enviada pelo
  painel), só atualiza status; senão cria (enviada pelo celular, `sent_by_user_id` nulo).
- `fromMe=false` → `inbound`, `unread_count + 1`.
- Mídia: `POST /chat/getBase64FromMediaMessage/{instance}` → storage → `media_path`.
- Emite `message.created` (e `message.updated` quando a mídia terminar de salvar).

### `MESSAGES_UPDATE`
`data.keyId` (ou `data.key.id`) + `data.status`: `SERVER_ACK` → `sent`, `DELIVERY_ACK` →
`delivered`, `READ`/`PLAYED` → `read`. Só avança o status, nunca regride. Emite `message.updated`.
