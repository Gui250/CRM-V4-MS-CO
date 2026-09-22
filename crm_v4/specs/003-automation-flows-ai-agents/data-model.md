# Data Model: Fluxos de Automação e Agentes de IA

Mesmas convenções da feature 001 (`specs/001-whatsapp-chat-panel/data-model.md`): toda tabela tem
`id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` e **RLS habilitado** (a
migration gerada recebe `ALTER TABLE … ENABLE ROW LEVEL SECURITY` à mão).

## Novos enums

| Enum | Valores |
|---|---|
| `ai_vendor` | `openai`, `anthropic`, `gemini` |
| `ai_test_status` | `ok`, `failed` |
| `flow_status` | `draft`, `active`, `inactive` |
| `flow_trigger_type` | `message_received`, `manual` |
| `run_status` | `running`, `waiting`, `completed`, `failed`, `cancelled` |
| `run_origin` | `message_received`, `manual`, `test` |
| `step_status` | `ok`, `failed` |
| `handling_mode` | `automation`, `human` |

## ai_providers

Credencial de um fornecedor de IA (FR-015). Pode haver mais de uma por fornecedor (ex.: duas
contas OpenAI).

| Campo | Tipo | Regras |
|---|---|---|
| name | text, unique | 2–60 caracteres; ex. "OpenAI produção" |
| vendor | `ai_vendor` | não muda depois de criado |
| key_ciphertext | bytea | chave cifrada, AES-256-GCM (research §7) |
| key_iv | bytea | 12 bytes |
| key_auth_tag | bytea | 16 bytes |
| key_hint | text | últimos 4 caracteres da chave; único dado da chave exposto |
| available_models | text[] | lista obtida no último teste de conexão |
| last_test_status | `ai_test_status` | só é salvo/atualizado com `ok` (FR-015: falha bloqueia) |
| last_tested_at | timestamptz | |

Salvar ou trocar a chave sempre testa a conexão antes; falha → 422 e nada é gravado.
Excluir: bloqueado (409) enquanto houver agente usando (edge case), listando os agentes.

## ai_agents

| Campo | Tipo | Regras |
|---|---|---|
| name | text, unique | 2–60 caracteres |
| provider_id | uuid → ai_providers (restrict) | |
| model | text | precisa estar em `available_models` do provedor ao salvar |
| instructions | text | 1–8.000 caracteres |
| history_size | int | 5–50, padrão 20 (research §6) |
| is_active | boolean | padrão `true` |
| created_by_user_id | uuid → users (set null) | |

Desativar (FR-018): as execuções que estão no bloco desse agente seguem pela saída
`unavailable` na próxima vez que forem avançadas; sem essa saída conectada, terminam como
`completed`. Excluir: bloqueado enquanto algum fluxo **ativo** usar o agente na versão atual.

## flows

| Campo | Tipo | Regras |
|---|---|---|
| name | text, unique | 1–100 caracteres |
| description | text, null | até 500 caracteres; mostrada no menu de disparo do chat |
| status | `flow_status` | padrão `draft` |
| trigger_type | `flow_trigger_type`, null | copiado do gatilho da versão atual para filtrar sem ler o grafo |
| priority | int | padrão 100; menor roda primeiro (FR-008) |
| current_version_id | uuid → flow_versions, null | null só antes do primeiro "Salvar" |
| activated_at | timestamptz, null | |
| created_by_user_id / updated_by_user_id | uuid → users (set null) | |

**Transições**: `draft → active` (validação completa, FR-006) · `active → inactive` (cancela as
execuções ativas com `end_reason = 'flow_deactivated'`, cenário US1-6) · `inactive → active`
(valida de novo). Salvar um fluxo `active` exige grafo válido (senão 422 pedindo para desativar
antes); `draft`/`inactive` aceitam rascunho incompleto, desde que o JSON respeite o schema dos
blocos. Excluir: só `draft`/`inactive` (409 se `active`), apaga versões e execuções em cascata.

## flow_versions

Cópia imutável do grafo (research §2).

| Campo | Tipo | Regras |
|---|---|---|
| flow_id | uuid → flows (cascade) | |
| number | int | 1, 2, 3… por fluxo; unique `(flow_id, number)` |
| graph | jsonb | `{ nodes, edges }` conforme [contracts/flow-graph.md](./contracts/flow-graph.md) |
| created_by_user_id | uuid → users (set null) | |

Nunca atualizada. Limpeza em research §13.

## flow_runs

Uma execução de um fluxo numa conversa (FR-009, FR-013).

| Campo | Tipo | Regras |
|---|---|---|
| flow_id | uuid → flows (cascade) | |
| version_id | uuid → flow_versions (cascade) | versão fixa até o fim (FR-007) |
| conversation_id | uuid → conversations (cascade) | |
| origin | `run_origin` | |
| status | `run_status` | |
| current_node_id | text, null | id do bloco no grafo |
| state | jsonb | dados do bloco atual (ex.: `{ "awaitingReply": true, "timeoutAt": "…" }`); padrão `{}` |
| resume_at | timestamptz, null | quando o laço deve retomar; só com `waiting` |
| lease_until | timestamptz, null | trava de quem está avançando; vencida = retomável (FR-012) |
| steps_count | int | ≥ 0; em 100 → `failed` (FR-011) |
| started_by_user_id | uuid → users (set null), null | disparo manual/teste |
| started_at / finished_at | timestamptz | `finished_at` null enquanto ativa |
| end_reason | text, null | `completed`, `handoff`, `opt_out`, `flow_deactivated`, `stopped_by_user`, `loop_limit`, `error` |
| error | text, null | mensagem legível quando `failed` |

Índices:
- `UNIQUE (conversation_id) WHERE status IN ('running','waiting')` (uma ativa por conversa)
- `(resume_at) WHERE status = 'waiting'` (laço do motor)
- `(flow_id, started_at DESC)` (histórico, US5)
- `(finished_at) WHERE finished_at IS NOT NULL` (retenção de 90 dias)

**Transições**:

```text
running ──bloco de espera──▶ waiting ──resume_at/resposta──▶ running
running ──bloco "encerrar" / fim do caminho──▶ completed
running ──erro de bloco / 100 passos──▶ failed
running|waiting ──passagem p/ humano, opt-out, fluxo desativado, "parar" no chat──▶ cancelled
```

Terminais (`completed`, `failed`, `cancelled`) nunca voltam.

## flow_run_steps

| Campo | Tipo | Regras |
|---|---|---|
| run_id | uuid → flow_runs (cascade) | |
| node_id | text | |
| node_type | text | copiado do bloco, para exibir sem ler a versão |
| status | `step_status` | |
| input | jsonb, null | ex. mensagem que casou a condição |
| output | jsonb, null | ex. texto enviado, saída escolhida (`yes`/`no`), resposta da IA |
| error | text, null | |
| started_at / finished_at | timestamptz | |

Índice: `(run_id, started_at)`. `input`/`output` são limitados a 8 KB cada (truncados com marca
`"…(truncado)"`) para que conversas longas do agente não inchem o banco.

## Alterações em tabelas da feature 001

### conversations (+ campos de atendimento, FR-021..FR-025)

| Campo | Tipo | Regras |
|---|---|---|
| handling_mode | `handling_mode` | padrão `automation` |
| handoff_reason | text, null | ex. "Cliente pediu para falar com uma pessoa" |
| handoff_summary | text, null | até 1.000 caracteres (research §8) |
| handoff_at | timestamptz, null | |
| assumed_by_user_id | uuid → users (set null), null | quem assumiu; null + `human` = "aguardando humano" |

**Transições**: `automation → human` (agente, bloco "passar para humano", falha do agente,
atendente envia mensagem ou clica "assumir") · `human → automation` (atendente clica "devolver";
limpa `handoff_*` e `assumed_by_user_id`). Atendente que "assume" uma conversa já `human` e sem
dono só preenche `assumed_by_user_id`.

### contacts (+ opt-out, FR-028)

| Campo | Tipo | Regras |
|---|---|---|
| automation_opt_out_at | timestamptz, null | preenchido = nenhum fluxo roda |
| automation_opt_out_by_user_id | uuid → users (set null), null | null = o próprio contato pediu |

### messages (+ origem automática, FR-010)

| Campo | Tipo | Regras |
|---|---|---|
| flow_run_id | uuid → flow_runs (set null), null | enviada por um bloco de fluxo |
| ai_agent_id | uuid → ai_agents (set null), null | enviada por um agente |

`CHECK`: `sent_by_user_id` e `flow_run_id` não são preenchidos juntos.

## Relacionamentos

```text
ai_providers 1─* ai_agents
flows 1─* flow_versions
flows 1─* flow_runs *─1 flow_versions
conversations 1─* flow_runs 1─* flow_run_steps
flow_runs 1─* messages (flow_run_id)
ai_agents 1─* messages (ai_agent_id)
users 1─* conversations (assumed_by_user_id)
```

O grafo (`flow_versions.graph`) referencia agentes por id dentro do JSON, sem FK; a validação de
ativação (FR-006) confere que cada agente existe e está ativo.
