# Data Model: Painel de Chat do WhatsApp

Postgres (local em dev, Supabase em prod). Todas as tabelas: `id uuid pk default gen_random_uuid()`,
`created_at timestamptz default now()`, `updated_at timestamptz` e **RLS habilitado** (research §2).

## users

| Campo | Tipo | Regras |
|---|---|---|
| name | text | 2–100 caracteres |
| email | citext, unique | e-mail válido, normalizado em minúsculas |
| password_hash | text | argon2id; nunca exposto pela API |
| role | enum `user_role` (`admin`, `attendant`) | primeiro usuário = `admin` |
| status | enum `user_status` (`pending`, `active`, `disabled`) | primeiro usuário = `active` |

Senha no cadastro: mínimo 8 caracteres.

**Transições de status**: `pending → active` (admin aprova) · `active → disabled` (admin desativa;
apaga as sessões) · `disabled → active`. Um admin não pode desativar a si mesmo nem remover o
último admin ativo.

## sessions

| Campo | Tipo | Regras |
|---|---|---|
| user_id | uuid → users (cascade) | |
| token_hash | text, unique | SHA-256 do token do cookie |
| expires_at | timestamptz | agora + 7 dias; renovado quando faltar < 1 dia |

Sessão válida = existe, não expirou e o usuário está `active`.

## whatsapp_connection

Uma linha só (FR-003), garantida por `singleton boolean unique default true check (singleton)`.

| Campo | Tipo | Regras |
|---|---|---|
| instance_name | text | = `EVOLUTION_INSTANCE` |
| status | enum `connection_status` (`disconnected`, `awaiting_qr`, `connected`) | |
| phone_number | text, null | preenchido ao conectar |
| last_qr | text, null | QR base64 atual; limpo ao conectar |
| last_connected_at | timestamptz, null | |

**Transições**: `disconnected → awaiting_qr` (admin inicia) → `connected` (webhook
`CONNECTION_UPDATE` open) → `disconnected` (logout ou queda). `awaiting_qr` renova `last_qr` a cada
`QRCODE_UPDATED`.

## contacts

| Campo | Tipo | Regras |
|---|---|---|
| wa_jid | text, unique | ex. `5511999999999@s.whatsapp.net`; grupos rejeitados |
| phone | text | só dígitos, derivado do JID |
| name | text, null | `pushName` do WhatsApp; exibe `phone` quando nulo |
| avatar_url | text, null | |

## conversations

| Campo | Tipo | Regras |
|---|---|---|
| contact_id | uuid → contacts, unique | uma conversa por contato (um número só) |
| last_message_at | timestamptz, null | ordenação da lista |
| last_message_preview | text, null | até 120 caracteres; "📷 Imagem", "🎤 Áudio" etc. para mídia |
| unread_count | int ≥ 0 | +1 a cada recebida; zera ao abrir (FR-009) |

Índices: `(last_message_at desc)`. Busca (FR-010): `ILIKE` em `contacts.name`/`contacts.phone`
(5.000 linhas dispensa índice trigram).

## messages

| Campo | Tipo | Regras |
|---|---|---|
| conversation_id | uuid → conversations (cascade) | |
| wa_message_id | text, unique, null | id do WhatsApp; null só enquanto `pending`; garante idempotência do webhook |
| direction | enum `message_direction` (`inbound`, `outbound`) | outbound inclui as enviadas pelo celular |
| type | enum `message_type` (`text`, `image`, `audio`, `video`, `document`, `unsupported`) | |
| body | text, null | texto ou legenda; até 4.096 caracteres no envio |
| media_path | text, null | chave no storage |
| media_mime | text, null | |
| media_filename | text, null | |
| media_size | int, null | bytes; limites em research §6 |
| status | enum `message_status` (`pending`, `sent`, `delivered`, `read`, `failed`), null | só outbound; `CHECK`: inbound ⇒ null, outbound ⇒ not null |
| sent_by_user_id | uuid → users, null | preenchido quando enviada pelo painel (FR-011) |
| sent_at | timestamptz | horário do WhatsApp (ou de criação, se pending) |
| error | text, null | motivo quando `failed` |

Índices: `(conversation_id, sent_at desc)` para paginação por cursor (FR-005).

**Transições de status (outbound)**: `pending → sent → delivered → read`; `pending → failed`;
`failed → pending` (reenviar, FR-007). Atualizações do webhook nunca regridem o status
(ex.: `delivered` chegando depois de `read` é ignorado).

## Relacionamentos

```text
users 1─* sessions
users 1─* messages (sent_by_user_id)
contacts 1─1 conversations 1─* messages
whatsapp_connection (singleton)
```
