# Research: Funis e Pipelines de Leads

Decisões técnicas da feature 002. Stack, camadas e convenções vêm da feature 001 e da constituição
v1.1.0; aqui só o que é novo.

## 1. Biblioteca de arrastar e soltar

- **Decision**: `@dnd-kit/core` 6 + `@dnd-kit/sortable` 10 no frontend (únicas dependências novas).
- **Rationale**: a spec exige arrastar entre colunas, reordenar dentro da coluna, reordenar etapas e
  alternativa por teclado com anúncios para leitor de tela (FR-006, FR-007, SC-008). O dnd-kit traz
  sensores de ponteiro, toque e teclado e `announcements` para `aria-live`, sem depender do DOM de
  terceiros. Versões estáveis com peer `react >=16.8`, compatíveis com React 19.
- **Alternatives considered**:
  - HTML5 Drag and Drop nativo: não funciona em toque nem por teclado; teríamos de escrever os dois
    à mão, o que custa mais código que a dependência (constituição V).
  - `@dnd-kit/react` 0.x: API nova, ainda pré-1.0.
  - `@atlaskit/pragmatic-drag-and-drop`: bom desempenho, mas acessibilidade por teclado é
    responsabilidade do app.

## 2. Ordem dos cartões dentro da etapa

- **Decision**: coluna `position double precision`. Mover calcula a posição a partir dos vizinhos
  do ponto de soltura: entre dois cartões = média; no topo = primeiro − 1024; no fim = último + 1024;
  coluna vazia = 0. O cliente envia só `{ stageId, beforeLeadId }` (o cartão que ficará logo abaixo;
  `null` = fim da coluna) e o servidor calcula. Se a distância entre vizinhos cair abaixo de 1e-6, o
  model renumera a coluna (múltiplos de 1024) na mesma transação.
- **Rationale**: um movimento atualiza uma linha (mais a renumeração rara), então dois atendentes
  movendo cartões diferentes não se bloqueiam. O servidor decide a posição, o cliente não precisa
  conhecer os valores.
- **Alternatives considered**: inteiro com deslocamento de todos os cartões abaixo (N updates por
  movimento, conflita com movimentos simultâneos); ordenação lexicográfica tipo LexoRank (mais
  código para o mesmo resultado nesta escala).

## 3. Ordem das etapas

- **Decision**: `position integer`. Reordenar envia a lista completa de IDs de etapa do funil
  (`PUT /pipelines/:id/stages/order`); o model regrava as posições 0..n−1 numa transação e recusa
  a lista se não contiver exatamente as etapas do funil.
- **Rationale**: funis têm poucas etapas (limite de 20); lista completa é idempotente e simples.

## 4. Carregamento do quadro (SC-003: 2.000 leads em < 2 s)

- **Decision**: `GET /pipelines/:id/board` devolve as etapas com `leadCount` e `valueTotalCents`
  (um `GROUP BY stage_id` sobre todos os leads que batem com o filtro) e os primeiros 50 cartões de
  cada etapa. Mais cartões por etapa com
  `GET /pipelines/:id/stages/:stageId/leads?cursor=` (keyset em `(position, id)`). Índice
  `leads (stage_id, position, id)`.
- **Rationale**: contagens e somas refletem todos os leads (edge case da spec) sem mandar 2.000
  cartões ao navegador. Mesmo padrão de cursor keyset da lista de conversas da 001, que respondeu em
  33 ms com 5.000 linhas.

## 5. Tempo real

- **Decision**: reutilizar o `EventBus` e o SSE `/api/events` da 001 com três eventos novos:
  `lead.upserted` (lead completo, cobre criação, edição e movimento), `lead.deleted` e
  `pipeline.changed` (estrutura de funil/etapas mudou; o cliente refaz a query do quadro).
- **Rationale**: o cliente aplica `lead.upserted` direto no cache (remove da coluna antiga, insere
  na nova pela `position`) e ajusta contagem e soma; mudanças de estrutura são raras e refazer a
  query é mais simples que aplicar diffs. Concorrência: último movimento salvo vence; o evento com
  o estado final faz os quadros convergirem.

## 6. Entrada automática de leads

- **Decision**: em `messages.receive` (controller da 001), depois de criar uma mensagem **recebida**
  (`inbound`) que é a primeira mensagem recebida da conversa, chamar
  `leads.enterFromWhatsApp(ctx, contactId)`. Ele busca o funil de entrada ativo e insere o lead na
  primeira etapa com `ON CONFLICT (pipeline_id, contact_id) DO NOTHING`. Sem funil de entrada, não
  faz nada.
- **Rationale**: "primeira mensagem recebida" em vez de "contato novo" cobre o contato criado por uma
  mensagem enviada do celular da empresa (que não pode gerar lead) e depois responde. Contatos com
  histórico anterior à feature já têm mensagens recebidas, então não viram leads sozinhos
  (Assumption da spec). Re-entregas do webhook não criam mensagem nova, então não disparam de novo.
  Excluir o lead não o recria na próxima mensagem.
- **Alternatives considered**: gatilho no banco (regra de negócio fora do model, contra o
  Princípio I); job periódico (atraso contra SC-004).

## 7. Funil de entrada único

- **Decision**: `pipelines.is_entry boolean` com índice único parcial
  `WHERE is_entry AND archived_at IS NULL`. Marcar um funil desmarca o anterior na mesma transação;
  arquivar o funil de entrada o desmarca.
- **Rationale**: o banco garante a regra "no máximo um funil de entrada ativo" mesmo com dois admins
  editando ao mesmo tempo.

## 8. Cores das etapas

- **Decision**: paleta fechada de 8 cores nomeadas (`gray`, `red`, `orange`, `amber`, `green`,
  `teal`, `blue`, `violet`), validada por Zod, com tokens em `globals.css`. O teste de contraste
  existente (`src/styles/contrast.test.ts`) passa a checar texto sobre cada cor de etapa.
- **Rationale**: FR-020 exige AA também nas cores escolhidas; cor livre (hex) não dá para garantir.

## 9. Valores monetários

- **Decision**: `value_cents bigint` (modo number no Drizzle), `≥ 0`, nulo quando não informado.
  Formatação em BRL no frontend com `Intl.NumberFormat('pt-BR', { currency: 'BRL' })`.
- **Rationale**: centavos inteiros evitam erro de ponto flutuante nas somas; bigint cobre qualquer
  valor realista.

## 10. Testes do arrastar e soltar

- **Decision**: a lógica de aplicar um movimento ao cache (`applyLeadMove`, `applyLeadUpsert` em
  `lib/pipeline-cache.ts`) é função pura testada diretamente. Os componentes são testados pelo menu
  "Mover para" e pelo sensor de teclado do dnd-kit (espaço para pegar, setas, espaço para soltar),
  que funcionam no jsdom. Arrastar com ponteiro fica para a validação manual do quickstart.
- **Rationale**: o jsdom não calcula layout, então simular arrasto por coordenadas é frágil. O
  teclado passa pelos mesmos handlers `onDragEnd` que o ponteiro.
