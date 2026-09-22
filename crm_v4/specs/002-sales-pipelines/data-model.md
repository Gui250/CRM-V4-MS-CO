# Data Model: Funis e Pipelines de Leads

Tabelas novas em `backend/src/db/schema.ts`, via uma migration nova (`0001_pipelines.sql`) com RLS
habilitado em todas (constituição IV). Tabelas `contacts`, `conversations` e `users` vêm da 001 e
não mudam.

## Enum `stage_kind`

`open` | `won` | `lost`. Etapas `won` e `lost` são as "finais" da spec.

## Enum `stage_color`

`gray` | `red` | `orange` | `amber` | `green` | `teal` | `blue` | `violet` (research §8).

## `pipelines` (Funil)

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| name | text | 1–60 caracteres após trim; único entre funis ativos (índice único parcial em `lower(name) WHERE archived_at IS NULL`) |
| is_entry | boolean, default false | no máximo um ativo: índice único parcial `(is_entry) WHERE is_entry AND archived_at IS NULL` |
| archived_at | timestamptz null | null = ativo |
| created_at / updated_at | timestamptz | |

Ao arquivar: `is_entry` vira false. Reativar falha com `PIPELINE_NAME_TAKEN` se outro funil ativo
tiver o mesmo nome.

## `pipeline_stages` (Etapa)

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| pipeline_id | uuid FK → pipelines, on delete cascade | |
| name | text | 1–40 caracteres após trim; único dentro do funil (case-insensitive) |
| color | stage_color, default `gray` | |
| kind | stage_kind, default `open` | |
| position | integer | 0..n−1 dentro do funil, regravadas numa transação ao reordenar |
| created_at / updated_at | timestamptz | |

Regras do model:
- Funil tem de 1 a 20 etapas (`STAGE_LIMIT = 20`). Excluir a última etapa: `LAST_STAGE` (409).
- Excluir etapa com leads exige `moveToStageId` do mesmo funil e diferente da excluída
  (`STAGE_NOT_EMPTY` 409 se ausente). Os leads vão para o fim da etapa destino e cada um ganha um
  movimento no histórico, com o admin como autor.
- Etapas sugeridas ao criar funil (`DEFAULT_STAGES`): Novo (open, gray), Em contato (open, blue),
  Proposta (open, amber), Ganho (won, green), Perdido (lost, red).
- "Primeira etapa" do funil de entrada = menor `position` com `kind = open`; se não houver etapa
  aberta, a de menor `position`.

## `leads` (Lead)

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| pipeline_id | uuid FK → pipelines, on delete cascade | |
| stage_id | uuid FK → pipeline_stages, on delete restrict | etapa pertence ao mesmo funil (checado no model) |
| contact_id | uuid FK → contacts, on delete cascade | único `(pipeline_id, contact_id)` (FR-014) |
| title | text null | até 120 caracteres; null → UI mostra nome ou número do contato |
| value_cents | bigint null | ≥ 0 (check) |
| assignee_id | uuid FK → users null, on delete set null | só usuário `active` (checado no model) |
| notes | text null | até 5.000 caracteres |
| lost_reason | text null | 1–200 caracteres; obrigatório ao entrar em etapa `lost`, limpo ao sair dela |
| position | double precision | ordem dentro da etapa (research §2) |
| stage_entered_at | timestamptz | atualizado a cada troca de etapa; base do "tempo na etapa" |
| created_by_id | uuid FK → users null, on delete set null | null = entrada automática |
| created_at / updated_at | timestamptz | |

Índices: `(stage_id, position, id)` para o quadro; `(contact_id)` para o chat; `(assignee_id)`
para o filtro.

## `lead_stage_changes` (Movimento do lead)

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid PK | |
| lead_id | uuid FK → leads, on delete cascade | |
| from_stage_id | uuid FK → pipeline_stages null, on delete set null | null = criação do lead |
| to_stage_id | uuid FK → pipeline_stages null, on delete set null | |
| from_stage_name / to_stage_name | text | copiados no momento do movimento, para o histórico sobreviver à exclusão da etapa |
| changed_by_id | uuid FK → users null, on delete set null | null = automático |
| changed_at | timestamptz default now() | |

Registrado na criação do lead (de null para a etapa inicial) e em toda troca de etapa, inclusive
na exclusão de etapa com remanejamento. Reordenar dentro da mesma etapa **não** gera registro.
Índice `(lead_id, changed_at desc)`.

## Transições do lead

```text
(criado) ──► etapa open ◄──► etapa open
                │  ▲
                ▼  │ (reabrir: move para open, limpa lost_reason)
          etapa won / etapa lost (exige lost_reason)
```

Qualquer etapa do mesmo funil pode ser destino. Não existe mover lead entre funis nesta versão;
para isso, cria-se um lead no outro funil (FR-014).

## Seed

A migration insere o funil "Vendas" com `is_entry = true` e as `DEFAULT_STAGES`, para o quadro
funcionar desde o primeiro acesso (Assumption da spec).
