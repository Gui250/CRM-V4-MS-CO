# Contrato: grafo do fluxo

Formato de `flow_versions.graph`, enviado pelo editor em `PUT /api/flows/{id}/graph` e devolvido
em `GET /api/flows/{id}`. O backend valida com Zod (união discriminada por `type`); o frontend usa
os mesmos nomes de tipo e saída nos nós customizados do React Flow.

```jsonc
{
  "nodes": [
    { "id": "n1", "type": "trigger.message_received", "position": { "x": 0, "y": 0 },
      "config": { "match": "first_message" } },
    { "id": "n2", "type": "wait", "position": { "x": 0, "y": 120 },
      "config": { "amount": 5, "unit": "seconds" } },
    { "id": "n3", "type": "send_text", "position": { "x": 0, "y": 240 },
      "config": { "text": "Olá, {{contato.primeiro_nome}}! Como podemos ajudar?" } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "sourceHandle": "next", "target": "n2" },
    { "id": "e2", "source": "n2", "sourceHandle": "next", "target": "n3" }
  ]
}
```

- `id` de nó e aresta: 1–40 caracteres `[A-Za-z0-9_-]`, únicos no grafo.
- `position`: números finitos (só para o editor; o motor ignora).
- Limites: até 200 nós e 400 arestas.
- Toda aresta entra na única entrada do nó alvo; gatilhos não têm entrada.

## Tipos de bloco

| `type` | `config` | Saídas (`sourceHandle`) |
|---|---|---|
| `trigger.message_received` | `match`: `any` \| `first_message` \| `keyword`; `keywords`: 1–20 textos de 1–50 caracteres (só com `keyword`; casa se a mensagem contém alguma, sem diferenciar maiúsculas/acentos) | `next` |
| `trigger.manual` | `{}` | `next` |
| `send_text` | `text`: 1–4.096 caracteres, aceita variáveis (research §11) | `next` |
| `send_media` | `mediaPath` (devolvido por `POST /api/flow-assets`), `mime`, `filename`, `caption?` até 1.024 | `next` |
| `wait` | `amount` ≥ 1, `unit`: `seconds` \| `minutes` \| `hours` \| `days`; total ≤ 30 dias | `next` |
| `wait_reply` | `timeout`: `{ amount, unit }`, total entre 1 minuto e 30 dias | `replied`, `timeout` |
| `condition` | `source`: `last_message` \| `contact_name` \| `contact_phone`; `operator`: `contains` \| `equals` \| `starts_with` \| `is_empty`; `value`: até 200 caracteres (ignorado em `is_empty`); comparação sem maiúsculas/acentos | `yes`, `no` |
| `ai_agent` | `agentId` (uuid); `inactivityTimeout`: `{ amount, unit }`, padrão 24 h | `completed`, `no_reply`, `unavailable` |
| `handoff` | `reason`: 1–200 caracteres | — (terminal) |
| `end` | `{}` | — (terminal) |

`last_message` = texto da mensagem recebida mais recente da conversa (vazio se for mídia).

## Semântica no motor

- `send_text` / `send_media`: envia pelo mesmo caminho das mensagens do painel (research §10). Se
  o WhatsApp estiver desconectado ou o envio falhar, a execução vira `failed` e a conversa passa
  para humano (edge case "número desconectado").
- `wait`: `waiting` com `resume_at = agora + duração`.
- `wait_reply`: `waiting` até a próxima mensagem recebida (→ `replied`) ou até o timeout
  (→ `timeout`).
- `ai_agent`: responde já na entrada (se a última mensagem da conversa for do contato) e fica em
  `waiting` entre mensagens, com debounce de 4 s (research §6). Sai por:
  - `completed`: o agente chamou `encerrar_atendimento`;
  - `no_reply`: o contato não respondeu dentro de `inactivityTimeout`;
  - `unavailable`: o agente está desativado quando o bloco é alcançado ou retomado.
  Se o agente chamar `transferir_para_humano`, ou o provedor falhar (FR-019), a execução termina
  como `cancelled` / `failed` e a conversa passa para humano; nenhuma saída é seguida.
- `handoff`: passa para humano com `reason` e encerra a execução (`cancelled`, `end_reason =
  handoff`).
- `end` ou qualquer saída sem aresta: execução `completed`.

## Validação para ativar (FR-006)

Além do schema acima, a ativação (e o salvamento de um fluxo já ativo) exige:

1. exatamente um nó de gatilho;
2. todo nó alcançável a partir do gatilho;
3. no máximo uma aresta por saída; a saída `next` do gatilho precisa estar conectada. Qualquer
   outra saída sem aresta encerra a execução (`completed`), então "enviar e parar" não exige um
   bloco `end`, e uma condição pode ter só o caminho `yes`;
4. todo `agentId` existe e o agente está ativo;
5. todo `mediaPath` existe no storage.

Erros voltam em `422` como `{ code: "INVALID_FLOW", message, issues: [{ nodeId?, edgeId?,
message }] }`, e o editor destaca cada `nodeId` com a mensagem.
