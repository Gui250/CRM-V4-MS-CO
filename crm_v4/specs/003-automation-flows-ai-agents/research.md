# Research: Fluxos de Automação e Agentes de IA

A stack, o layout e as convenções vêm da feature 001 (`specs/001-whatsapp-chat-panel/research.md`).
Aqui ficam só as decisões novas.

## 1. Editor visual de fluxos

- **Decision**: `@xyflow/react` (React Flow 12) no frontend para a área de trabalho: arrastar
  blocos, conectar saídas a entradas, zoom e movimentação da área. Cada tipo de bloco é um
  componente React próprio (nó customizado); o painel lateral edita a configuração do bloco
  selecionado. O estado do grafo fica em `useState` local da página do editor até "Salvar".
- **Rationale**: FR-001 pede arrastar, conectar, zoom e movimentação. Fazer isso à mão (SVG, hit
  testing, pan/zoom, arestas com curvas, seleção) daria mais de mil linhas de código difícil de
  testar. React Flow é a biblioteca que o próprio n8n-like de mercado usa, MIT, sem dependências
  pesadas, e funciona com React 19.
- **Alternatives considered**: canvas próprio em SVG (custo alto, reinventa a roda); Rete.js
  (API mais complexa, menos usado com React); formulário em lista de passos sem canvas (não atende
  "tipo n8n" nem FR-001).
- **Nova dependência justificada** (Constituição V): só `@xyflow/react` no frontend.

## 2. Formato do fluxo: grafo JSON versionado

- **Decision**: o fluxo é um grafo `{ nodes, edges }` guardado como `jsonb` numa tabela de
  versões imutáveis (`flow_versions`). Cada "Salvar" cria uma versão nova e aponta
  `flows.current_version_id` para ela; execuções guardam o `version_id` em que começaram (FR-007).
  O backend valida o grafo com um schema Zod por tipo de bloco (união discriminada por `type`)
  no salvamento, e roda uma validação estrutural extra antes de ativar (FR-006). O contrato está
  em [contracts/flow-graph.md](./contracts/flow-graph.md).
- **Rationale**: grafos mudam de forma com frequência (novos blocos); `jsonb` evita uma tabela por
  tipo de bloco. Versões imutáveis resolvem "execuções em andamento terminam na versão em que
  começaram" sem lógica de migração. Um fluxo tem dezenas de blocos, então copiar o grafo a cada
  salvar custa poucos KB.
- **Alternatives considered**: tabelas `nodes`/`edges` normalizadas (joins e migração para cada
  bloco novo, sem ganho de consulta); versionar só ao ativar (execuções de teste de rascunho
  ficariam sem versão fixa).

## 3. Motor de execução durável

- **Decision**: interpretador próprio no backend, como controller (`backend/src/controllers/
  automation/engine.ts`, um executor por tipo de bloco em `controllers/automation/nodes/`), com
  estado em Postgres acessado só pelos models:
  - `flow_runs` guarda a posição atual (`current_node_id`), situação e `resume_at`.
  - Um gatilho cria a execução e chama o motor na hora, sem esperar a resposta do webhook
    (`void engine.advance(runId)` com erro logado). O webhook da Evolution responde em
    milissegundos mesmo com um agente de IA demorando 15 s.
  - Blocos de espera gravam `status = 'waiting'` e `resume_at` e param.
  - Um laço único (`backend/src/jobs/automation-worker.ts`, `setInterval` de 5 s, iniciado no
    `server.ts` e parado no `onClose`) pega execuções com
    `resume_at <= now()` via `SELECT … FOR UPDATE SKIP LOCKED` e as avança. O mesmo laço retoma
    execuções `running` cujo `lease_until` venceu (processo caiu no meio), cumprindo FR-012.
  - Cada bloco executado grava um `flow_run_steps` (entrada, saída, erro) e incrementa
    `steps_count`; em 100 a execução falha (FR-011).
- **Rationale**: Postgres já está na stack e sobrevive a reinícios; `SKIP LOCKED` evita que o
  laço e um gatilho avancem a mesma execução ao mesmo tempo. Com volume de uma empresa (dezenas de
  execuções por minuto), um intervalo de 5 s mantém a tolerância de 1 min com folga e o custo é uma
  query indexada.
- **Alternatives considered**: `pg-boss` (fila em Postgres completa; útil, mas agendamento de uma
  coluna `resume_at` já cobre); BullMQ (exige Redis, um serviço a mais); `setTimeout` em memória
  (perde esperas no reinício, viola FR-012); n8n embutido/headless (outro serviço, outro banco,
  licença *sustainable use* e não integra com o chat e as permissões do CRM).
- **Limite conhecido**: igual ao bus SSE, supõe uma instância do backend. `SKIP LOCKED` já permite
  mais de uma instância para o laço; o que não escala é o bus em memória (feature 001).

## 4. Uma execução por conversa e escolha de gatilho

- **Decision**: índice único parcial `flow_runs (conversation_id) WHERE status IN ('running',
  'waiting')` garante no máximo uma execução ativa por conversa (FR-009). Ao chegar mensagem
  recebida numa conversa em modo automação:
  1. se o contato tem opt-out ou a conversa está em modo humano → nada;
  2. se há execução esperando resposta (bloco "esperar resposta" ou agente) → retoma essa;
  3. se há execução ativa em outro estado → nada (edge case "esperar longo");
  4. senão, pega os fluxos ativos com gatilho `message_received` cujos filtros casam, ordena por
     `priority` (menor primeiro) e inicia só o primeiro (FR-008).
  Disparo manual (US4) segue a mesma regra: se já existe execução ativa na conversa, 409.
- **Rationale**: a regra fica no banco, não depende de lock em memória, e o conflito vira um
  `unique_violation` fácil de tratar.
- **Alternatives considered**: permitir várias execuções paralelas por conversa (contato recebe
  mensagens cruzadas de fluxos diferentes).

## 5. Agentes de IA e provedores

- **Decision**: um módulo por provedor em `backend/src/integrations/ai/` (`openai.ts`,
  `anthropic.ts`, `gemini.ts`), todos com a mesma interface `AiProviderClient`:
  `generate({ apiKey, model, system, turns, tools, signal }) → { text, toolCalls }` e
  `listModels(apiKey)` (que também é o teste de conexão).
  - OpenAI: `fetch` nativo, `POST https://api.openai.com/v1/responses` (`store: false`), header
    `Authorization: Bearer`; resposta validada com Zod.
  - Gemini: `fetch` nativo, `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`,
    header `x-goog-api-key`; resposta validada com Zod.
  - Anthropic: **SDK oficial `@anthropic-ai/sdk`** (`messages.create` + `models.list`), por
    orientação da referência da API da Anthropic, que exige o SDK oficial em projetos TypeScript em
    vez de HTTP cru. Os tipos do SDK cobrem a fronteira; o texto e os `tool_use` extraídos ainda
    passam pela mesma interface comum.
  - Teste de conexão (FR-015): listar modelos. Não gasta tokens e a lista alimenta o seletor de
    modelo.
- O agente recebe duas ferramentas (tool/function calling), iguais nos três provedores:
  `transferir_para_humano(motivo)` e `encerrar_atendimento(resumo)`. A primeira passa a conversa
  para humano (FR-017); a segunda segue pela saída "concluído" do bloco.
- Timeout: `AbortSignal.timeout(30_000)` (FR-019). Falha, timeout ou resposta inválida → nada é
  enviado, o passo registra o erro e a conversa vai para humano.
- **Rationale**: três provedores são três usos concretos da mesma interface (Constituição V
  permite a abstração). OpenAI e Gemini com `fetch` + Zod têm ~50 linhas cada e nenhuma
  dependência. Para a Anthropic, o SDK oficial é a única dependência nova do backend.
- **Alternatives considered**: Vercel AI SDK (`ai` + 3 pacotes `@ai-sdk/*`: 4 dependências para
  ~150 linhas nossas); LangChain (pesado); SDKs oficiais de OpenAI e Gemini (2 dependências a mais
  para chamadas que o `fetch` + Zod já resolve).

## 6. Histórico lido pelo agente e mensagens em sequência

- **Decision**: o agente lê as últimas `history_size` mensagens (padrão 20, máximo 50) de texto da
  conversa, mapeando `inbound` → papel usuário e `outbound` → papel assistente; mídia vira
  marcador ("[imagem]", "[áudio]"). Quando o agente está esperando resposta e chega mensagem, o
  motor não responde na hora: grava `resume_at = now() + 4 s`. Cada nova mensagem nesse intervalo
  empurra o `resume_at` de novo. Quando o laço retoma, o agente vê todas juntas e responde uma vez
  (FR-020).
- **Rationale**: debounce usando a mesma coluna `resume_at` do motor, sem timer extra. 4 s cobre o
  padrão de quem digita frases curtas em sequência sem estourar SC-003 (15 s).
- **Alternatives considered**: responder a cada mensagem (respostas duplicadas e fora de ordem);
  timer em memória (perdido no reinício).

## 7. Guarda das credenciais de IA

- **Decision**: chave da API cifrada com AES-256-GCM (`node:crypto`) usando `AI_CREDENTIALS_KEY`
  (32 bytes em base64, variável de ambiente do backend). No banco ficam `ciphertext`, `iv`,
  `auth_tag` e `key_hint` (últimos 4 caracteres). A API nunca devolve a chave, só o `keyHint`
  (FR-015).
- **Rationale**: um dump do banco ou um backup vazado não entrega as chaves dos provedores, que
  geram custo direto. `node:crypto` já está no runtime.
- **Alternatives considered**: chave em texto no banco (vazamento = custo); chaves só em variável
  de ambiente (admin não conseguiria cadastrar provedores pela tela, e o PRD pede múltiplos
  provedores configuráveis); Supabase Vault (não existe no Postgres local).

## 8. Modo de atendimento e passagem para humano

- **Decision**: `conversations` ganha `handling_mode` (`automation` | `human`), `handoff_reason`,
  `handoff_summary`, `handoff_at`, `assumed_by_user_id`. "Aguardando humano" = `handling_mode =
  'human' AND assumed_by_user_id IS NULL` (FR-023). Passar para humano (FR-022) interrompe a
  execução ativa, grava motivo e resumo e publica `conversation.updated`. Mensagem enviada por um
  atendente pelo painel (`messages.sendText/sendMedia`) chama o mesmo caso de uso com `assumedBy`
  = usuário.
- **Resumo (FR-024)**: com agente, pede ao mesmo provedor um resumo de até 3 frases (mesmo timeout
  de 30 s; se falhar, cai no plano B). Sem agente, ou se falhar, guarda as 5 últimas mensagens em
  texto.
- **Rationale**: colunas na conversa bastam; o histórico completo já está nas mensagens e nos
  passos da execução.
- **Alternatives considered**: tabela de "tickets" de atendimento (atribuição e fila completas
  estão fora do escopo, feature 001).

## 9. Opt-out ("parar", "sair", "descadastrar")

- **Decision**: antes de avaliar gatilhos, o texto recebido é normalizado (trim, minúsculas, sem
  acento e sem pontuação final). Se for exatamente uma das palavras de opt-out, o contato ganha
  `automation_opt_out_at` e a execução ativa é interrompida (FR-028). Só a mensagem inteira conta:
  "não quero sair agora" não é opt-out.
- **Rationale**: casamento exato evita falso positivo em conversas normais; o custo de um falso
  negativo é baixo porque o atendente pode marcar à mão.

## 10. Identificação das mensagens automáticas

- **Decision**: `messages` ganha `flow_run_id` e `ai_agent_id` (ambos nulos para mensagens
  humanas). O DTO ganha `automation: { kind: 'flow' | 'agent', name } | null`, exibido no balão
  como "Automação: <fluxo>" ou "IA: <agente>" (FR-010). Envio automático reutiliza
  `insertPending → deliver` de `controllers/messages.ts`, extraído para uma função interna
  compartilhada, então status, reenvio e SSE funcionam igual às mensagens do painel.
- **Rationale**: mesmo pipeline de envio, sem duplicar a lógica de status/merge com webhook.

## 11. Variáveis nas mensagens

- **Decision**: substituição simples de `{{contato.nome}}`, `{{contato.telefone}}` e
  `{{contato.primeiro_nome}}` por regex. Variável sem valor vira string vazia; nome ausente usa o
  telefone. Sem linguagem de expressão.
- **Rationale**: é o que FR-004 pede; expressões tipo n8n (`{{$json…}}`) ficam para quando houver
  blocos que produzam dados (requisição HTTP, fora de escopo).

## 12. Execução de teste (FR-014)

- **Decision**: "Testar" cria uma versão do rascunho, cria (ou reaproveita) a conversa do número
  de teste e inicia uma execução com `is_test = true`, ignorando situação do fluxo e prioridade.
  O frontend acompanha pelo evento SSE `run.updated`. Execuções de teste aparecem no histórico
  com um selo "teste".
- **Rationale**: roda o mesmo motor de verdade, então o teste prova o comportamento real.

## 13. Retenção de 90 dias (FR-013)

- **Decision**: o mesmo laço do motor, uma vez por hora, apaga `flow_runs` terminadas há mais de
  90 dias (os passos caem por `ON DELETE CASCADE`). `flow_versions` sem execuções e que não são a
  versão atual também são apagadas.
- **Rationale**: sem cron externo; a query é indexada por `finished_at`.

## 14. Tempo real

- **Decision**: reaproveita `GET /api/events`. `ConversationDto` ganha os campos de atendimento
  (então `conversation.updated` já leva a passagem para humano); `MessageDto` ganha `automation`.
  Evento novo `run.updated` (execução mudou de situação ou passou por um bloco) para o indicador
  "automação em andamento" no chat e a visualização de teste ao vivo. Ver
  [contracts/sse-events.md](./contracts/sse-events.md).
