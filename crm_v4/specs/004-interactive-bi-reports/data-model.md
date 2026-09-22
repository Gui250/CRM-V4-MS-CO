# Data Model: Relatórios de BI Interativos

Tabelas novas em `backend/src/db/schema.ts`, todas com `ENABLE ROW LEVEL SECURITY` na migration
(ver `0000_init.sql`). Tabelas da feature 001 (`users`, `contacts`, `conversations`, `messages`)
são lidas pelas fontes internas e não mudam.

## Enums

- `bi_source_kind`: `spreadsheet_file`, `spreadsheet_url`, `postgres`, `mysql`, `api`
- `bi_refresh_interval`: `manual`, `15m`, `1h`, `6h`, `24h`
- `bi_snapshot_status`: `running`, `succeeded`, `failed`
- `bi_share_permission`: `edit`, `view`

Tipos de campo (`FieldType`, validado em Zod, não enum de banco): `text`, `number`, `currency`,
`date`, `datetime`, `boolean`.

## bi_sources (fontes externas)

| Coluna | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| name | text | obrigatório, 2–100, único (case-insensitive, `citext`) |
| kind | bi_source_kind | imutável depois de criado |
| config | jsonb | parte não secreta, validada por schema Zod por `kind` (abaixo) |
| secrets_encrypted | text null | AES-256-GCM (`iv.tag.ciphertext` base64); nunca devolvido |
| fields | jsonb | `SourceField[]` (abaixo); atualizado a cada captura |
| refresh_interval | bi_refresh_interval | default `manual`; `spreadsheet_file` só aceita `manual` |
| next_refresh_at | timestamptz null | null quando `manual`; índice parcial para o agendador |
| current_snapshot_id | uuid null FK → bi_snapshots | captura lida pelos relatórios |
| last_attempt_at | timestamptz null | |
| last_error | text null | mensagem pt-BR da última falha; null após sucesso |
| created_by | uuid FK → users (set null) | |
| created_at / updated_at | timestamptz | |

`config` por tipo:

- `spreadsheet_file`: `{ storagePath, originalFilename, sheet?: string, headerRow: int ≥ 1 }`
- `spreadsheet_url`: `{ url (https, host docs.google.com), gid?: string, headerRow }`
- `postgres` / `mysql`: `{ host, port, database, user, ssl: boolean, mode: 'table' | 'query',
  table?: { schema?, name }, query?: string (≤ 10.000 chars, SELECT/WITH único) }`;
  segredo: `{ password }`
- `api`: `{ url (http/https), method: 'GET' | 'POST', headers: {nome: valor}[] não secretos,
  query: {nome: valor}[], body?: string, itemsPath?: string, pagination?: { param, start: int,
  maxPages ≤ 50 } }`; segredo: `{ headers: {nome: valor}[] }` (ex.: `Authorization`)

`SourceField`: `{ key (nome original, único na fonte), label, detectedType: FieldType,
type: FieldType (corrigido pelo usuário; default = detectedType), invalidCount: int }`.

**Transições**: criar = testar + prévia (sem gravar) → salvar grava a fonte e dispara a primeira
captura. Corrigir o tipo de um campo (`type`) dispara nova captura (reprocessa o arquivo guardado
ou busca de novo). Excluir é bloqueado se algum relatório referencia a fonte (FR-031); a checagem
lê `reports.definition` (`jsonb_path_exists`).

## bi_snapshots (capturas)

| Coluna | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| source_id | uuid FK → bi_sources (cascade) | |
| status | bi_snapshot_status | `running` → `succeeded` \| `failed` |
| row_count | integer | ≥ 0; recusa em > 500.000 (vira `failed`) |
| started_at / finished_at | timestamptz | |
| error | text null | |

Regra: no máximo uma captura `running` por fonte (índice único parcial
`(source_id) WHERE status = 'running'`). Ao terminar com sucesso, numa transação: fonte aponta
para a nova captura, `fields` e `last_error = null` atualizados, capturas anteriores apagadas.
Em falha: `last_error` gravado, captura atual intacta (FR-028).

## bi_snapshot_rows

| Coluna | Tipo | Regras |
|---|---|---|
| snapshot_id | uuid FK → bi_snapshots (cascade) | |
| row_num | integer | PK composta `(snapshot_id, row_num)` |
| data | jsonb | chaves = `SourceField.key`; valores normalizados (research §1) |

## bi_relationships

| Coluna | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| left_source_id / right_source_id | text | id de `bi_sources` ou id interno (`internal:…`) |
| left_field / right_field | text | chave de campo existente em cada fonte |
| created_at | timestamptz | |

Únicos por par (em qualquer ordem); fontes diferentes; tipos dos dois campos compatíveis
(texto↔texto, número↔número). Um salto só (research §4). Removidos junto com a fonte.

## reports

| Coluna | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| name | text | 1–100 |
| owner_id | uuid FK → users (cascade) | |
| definition | jsonb | `ReportDefinition` (abaixo), validado por Zod no salvar |
| version | integer | começa em 1; +1 a cada salvar; conflito → 409 (FR-036) |
| updated_by | uuid null FK → users (set null) | quem salvou por último (mensagem de conflito) |
| created_at / updated_at | timestamptz | |

## report_shares

| Coluna | Tipo | Regras |
|---|---|---|
| report_id | uuid FK → reports (cascade) | PK composta `(report_id, user_id)` |
| user_id | uuid FK → users (cascade) | não pode ser o dono |
| permission | bi_share_permission | |
| created_at | timestamptz | |

## ReportDefinition (jsonb, schema Zod em `models/bi/definition.ts`)

```text
ReportDefinition
  pages: Page[] (1–20)
  calculatedFields: CalculatedField[] (≤ 50)

Page
  id, name (1–60)
  filters: Filter[]                  # filtros de página (componentes de filtro gravam aqui o padrão)
  visuals: Visual[] (≤ 30)

Visual
  id
  type: kpi | bar | column | line | area | pie | donut | funnel | table | pivot
        | filter_list | filter_date | text
  layout: { x, y, w, h }             # grade de 12 colunas; w 1–12, h 1–20
  title?: string (≤ 100)
  sourceId?: string                  # obrigatório exceto para `text`
  slots: {                           # quais slots cada tipo aceita: contracts/report-definition.md
    category?: FieldRef[]  value?: MeasureRef[]  legend?: FieldRef  columns?: FieldRef
  }
  options: { sort?: {by: 'value'|'category', dir}, limit?: 1–1000 (default 20),
             numberFormat?: integer|decimal|currency|percent, crossFilter: boolean (default true),
             compareWithPreviousPeriod?: boolean (kpi), text?: string (≤ 2.000, só `text`) }

FieldRef     { sourceId, field (key, ou "calc:<id>" para campo calculado), dateGrain?: day|week|month|quarter|year }
MeasureRef   { sourceId, field (key ou "calc:<id>"), aggregation?: sum|avg|count|count_distinct|min|max }
Filter       { sourceId, field, op: in | not_in | between | gte | lte | is_null | not_null,
               values: (string | number | boolean)[] }
CalculatedField { id, name, expression (≤ 500, gramática research §3), sourceId }
```

Validação ao salvar (além do schema): `sourceId` existe e o usuário pode vê-la; cada `field`
existe na fonte (ou numa fonte relacionada à fonte do componente); expressões compilam. Campos
ausentes numa fonte já salva **não** impedem abrir o relatório: o componente mostra o aviso
"campo X não existe mais" (edge case da spec).

## Fontes internas (código, `models/bi/internal-sources.ts`)

Não têm linhas em `bi_sources`; são SELECTs fixos com campos tipados. Nesta feature:

- `internal:whatsapp_conversations`: conversa, contato (nome, telefone), criada em, última
  mensagem em, não lidas, total de mensagens, recebidas, enviadas.
- `internal:whatsapp_messages`: mensagem, conversa, contato, direção (recebida/enviada), tipo,
  situação, enviada em, atendente (nome de quem enviou, "Contato" nas recebidas).

Funis (002) e automações (003) entram aqui quando existirem (FR-021), sem mudar o formato.
