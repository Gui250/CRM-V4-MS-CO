# Research: Relatórios de BI Interativos

Todas as incógnitas do Technical Context resolvidas abaixo. Premissas da spec (fontes suportadas,
dados copiados em vez de consultados ao vivo) são tomadas como decisões de produto.

## 1. Onde ficam os dados das fontes externas

- **Decision**: cada atualização de fonte externa grava uma **captura** no próprio Postgres do CRM:
  tabela `bi_snapshot_rows (snapshot_id, row_num, data jsonb)`. Os valores entram já normalizados
  pelo tipo do campo (número como número JSON, data como ISO 8601 em UTC, sim/não como boolean,
  inválido como `null`), então as consultas fazem `(data->>'campo')::numeric` sem risco de erro de
  conversão. A fonte aponta para a captura atual (`current_snapshot_id`); uma captura nova só vira
  atual quando termina com sucesso, e a anterior é apagada em seguida.
- **Rationale**: atende "dados copiados" (Assumptions) e FR-028 (falha mantém os últimos dados).
  Uma tabela genérica evita DDL dinâmico (criar/alterar tabela por fonte) e funciona igual em
  Postgres local e Supabase, com RLS e migrations normais.
- **Ceiling**: agregação por varredura de JSONB fica em ~1–2 s para 500.000 linhas; é o limite da
  meta SC-002 (3 s). Se as medições da quickstart passarem disso, trocar por tabela tipada por
  captura (`bi_data.snap_<id>` com colunas reais) mantendo o mesmo compilador de consultas.
- **Alternatives considered**: tabela tipada por fonte (mais rápida, mas DDL dinâmico e troca de
  tipo exige recriar tabela); DuckDB embutido (dependência nativa nova e segundo motor de dados);
  consultar a fonte ao vivo a cada clique (contraria Assumptions e deixa relatório refém de API
  lenta).

## 2. Motor de consulta (componentes → SQL)

- **Decision**: um único compilador puro `compileQuery(dataset, query) → SQL parametrizado` em
  `backend/src/models/bi/query-compiler.ts`. Entrada: dimensões (campo + agrupamento de data),
  medidas (campo + agregação ou campo calculado), filtros, ordenação, limite. O `dataset` é uma
  subconsulta: para fontes internas, um SELECT fixo definido em código sobre as tabelas do CRM; para
  externas, um SELECT sobre `bi_snapshot_rows` que expõe cada campo com cast pelo tipo. Nomes de
  campo nunca são interpolados: o compilador só aceita campos que existem no schema da fonte e os
  referencia por índice numa lista permitida (`sql.identifier`/`data->>$n`). Datas agrupadas com
  `date_trunc(grain, x AT TIME ZONE 'America/Sao_Paulo')` (FR-037). Toda consulta de relatório roda
  com `SET LOCAL statement_timeout = '30s'`.
- **"Top N + Outros"** (FR-006) feito no SQL: CTE com os N maiores valores da dimensão e reagrupamento
  `CASE WHEN dim IN (top) THEN dim ELSE 'Outros' END`, o que mantém média e contagem distinta
  corretas (somar no cliente não mantém).
- **Rationale**: um lugar só gera SQL, então segurança (injeção) e fuso ficam testáveis em testes
  unitários de função pura; Postgres faz a agregação (Princípio V).
- **Alternatives considered**: agregar no Node (lento, memória); Cube/semantic layer (serviço a
  mais); SQL escrito pelo usuário para cada componente (inseguro e não é "arrastar e soltar").

## 3. Campos calculados (FR-007)

- **Decision**: expressões guardadas na definição do relatório, com gramática mínima: números,
  referências `[Campo]`, `+ - * /`, parênteses e funções de agregação `SUM|AVG|COUNT|COUNT_DISTINCT|MIN|MAX`.
  Parser recursivo descendente (~100 linhas) em `models/bi/expression.ts` que gera fragmento SQL
  parametrizado; divisão vira `NULLIF(…, 0)`. Expressão com agregação é medida (ex.:
  `COUNT([Ganho]) / COUNT([Lead])`); sem agregação é coluna por linha.
- **Rationale**: cobre "aritmética entre campos e razão entre agregações" sem `eval` nem linguagem
  de fórmulas (fora de escopo pela spec).
- **Alternatives considered**: `mathjs` (dependência grande, avalia no Node e não em SQL); DAX-like
  (fora de escopo).

## 4. Relacionamentos entre fontes (FR-030, FR-014)

- **Decision**: relacionamento = par `(fonte A, campo a) ↔ (fonte B, campo b)`, um salto só. Usos:
  (1) componente pode usar campos da fonte relacionada, o compilador faz `LEFT JOIN` pela chave;
  (2) filtro sobre a fonte B se propaga a um componente da fonte A como
  `a IN (SELECT b FROM B WHERE filtro)`. Sem cadeias de relacionamentos (spec: fora de escopo).
- **Rationale**: é o mínimo que dá sentido a "telefone da planilha ↔ telefone do contato".
- **Alternatives considered**: modelo estrela com várias relações (fora de escopo pela spec).

## 5. Conectores de fontes externas

- **Decision** (`backend/src/integrations/bi-connectors/`, um módulo por tipo, todos devolvendo
  `AsyncIterable<Record<string, unknown>>` para ingestão em lotes de 1.000 linhas):
  - **Planilha por arquivo**: upload via `@fastify/multipart` (já instalado), limite 50 MB, arquivo
    guardado pelo `storage` existente (para reprocessar quando o tipo de um campo é corrigido).
    `.csv` com `csv-parse` (streaming; detecta `;` ou `,`); `.xlsx` com `exceljs` (leitor em
    streaming, lista abas).
  - **Planilha online**: link do Google Planilhas convertido para a URL de exportação CSV da aba
    (`/export?format=csv&gid=…`) e lido pelo mesmo leitor CSV.
  - **Banco externo PostgreSQL**: driver `postgres` (já instalado), transação `READ ONLY`,
    `statement_timeout` 30 s, cursor em lotes.
  - **Banco externo MySQL**: `mysql2` (nova dependência), `START TRANSACTION READ ONLY`,
    `max_execution_time` 30 s, `multipleStatements: false`, stream de linhas.
  - **API JSON**: `fetch` nativo com `AbortSignal.timeout(30_000)`, resposta limitada a 20 MB por
    página, lista extraída por caminho pontuado (`data.items`), objetos aninhados achatados com `.`
    no nome do campo, paginação opcional por parâmetro de página até 50 páginas (FR-029).
- **Somente leitura em bancos (FR-023)**: três camadas: (1) validação da consulta: uma única
  instrução começando por `SELECT` ou `WITH`, sem `;` fora de strings; (2) transação read-only no
  próprio banco; (3) recomendação na tela de usar usuário só-leitura. Escolher tabela gera
  `SELECT * FROM "schema"."tabela"` com identificadores escapados pelo driver.
- **Alternatives considered**: SheetJS (versão do npm desatualizada com CVEs; a mantida só por CDN
  própria); `papaparse` (voltado ao navegador); Knex para os dois bancos (camada a mais para duas
  consultas); OAuth do Google (fora de escopo pela spec).

## 6. Proteção de rede (SSRF) em conectores

- **Decision**: antes de conectar/buscar, o host é resolvido (`dns.lookup`, todas as famílias) e
  recusado se cair em faixa privada, loopback, link-local ou metadados de nuvem, usando
  `net.BlockList` (stdlib). Redirecionamentos HTTP seguidos manualmente (até 5), revalidando cada
  destino. Liberado por `BI_ALLOW_PRIVATE_NETWORKS=true` (padrão `true` só em dev, para testar com o
  Postgres do docker compose).
- **Rationale**: administradores informam URLs e hosts arbitrários; sem isso o backend vira ponte
  para a rede interna do servidor (Princípio IV).
- **Ceiling**: há janela entre resolver e conectar (DNS rebinding). Aceito porque só
  administradores configuram fontes; fechar com agente HTTP que fixa o IP resolvido se virar risco.

## 7. Credenciais das fontes (FR-026)

- **Decision**: senhas, tokens e cabeçalhos secretos cifrados com AES-256-GCM (`node:crypto`),
  chave de 32 bytes em `BI_SECRETS_KEY` (base64, só no backend). Guardados numa coluna
  `secrets_encrypted` separada da configuração visível. A API devolve apenas
  `{ "password": "••••1234" }`-style (últimos 4) e, ao editar, campo vazio mantém o valor salvo.
- **Alternatives considered**: Supabase Vault (não existe no Postgres local); texto puro (viola
  Princípio IV).

## 8. Atualização programada (FR-027)

- **Decision**: agendador dentro do backend (`setInterval` de 60 s em `server.ts`) que pega fontes
  com `next_refresh_at <= now()` usando `FOR UPDATE SKIP LOCKED` e roda uma de cada vez. Estado
  (`next_refresh_at`, última tentativa, erro) fica no banco, então reinícios não perdem agenda.
  Atualização manual chama o mesmo controller.
- **Rationale**: o backend já é instância única (CLAUDE.md); cron externo ou fila seria infra a
  mais.
- **Alternatives considered**: `pg_cron` (não existe no Postgres local sem extensão); BullMQ/Redis
  (serviço novo).

## 9. Reconhecimento de tipos e sugestões (FR-010 a FR-012)

- **Decision**: função pura `inferFieldType(samples: string[])` sobre as primeiras 1.000 linhas.
  Ordem: vazio → sim/não (`sim/não/true/false/s/n`) → número (aceita `1.234,56`, `1,234.56`,
  `R$`, `%`; moeda se ≥80% das amostras têm `R$`) → data (`dd/mm/aaaa`, ISO, com ou sem hora) →
  texto. Um tipo é aceito se ≥95% das amostras não vazias batem. Sugestões por regra fixa:
  1 número → cartão; data + número → linha; texto + número → barras (pizza se ≤6 categorias);
  campo "etapa" de funil (quando existir a feature 002) → funil. "Relatório sugerido" = até 2
  cartões com os primeiros campos numéricos + série temporal pelo primeiro campo de data + ranking
  pela categoria de menor cardinalidade entre 3 e 50.
- **Rationale**: regras determinísticas são testáveis e atendem SC-004/SC-005 sem IA.
- **Alternatives considered**: sugestão por IA (provedores só chegam na feature 003; resultado não
  determinístico).

## 10. Editor no navegador

- **Decision**:
  - **Grade**: `react-grid-layout` 2.x (12 colunas; mover, redimensionar, compactação sem
    sobreposição, soltar item vindo de fora da grade). Resolve FR-002 inteiro; fazer à mão é
    colisão/compactação/resize, código grande e cheio de casos de borda.
  - **Arrastar campos para espaços do componente e da paleta para a grade**: Drag and Drop nativo
    do HTML5 (sem biblioteca). Alternativa por teclado/menu (FR-008): cada campo e componente tem
    menu "Adicionar a…" e cada componente selecionado aceita setas (mover) e Shift+setas
    (redimensionar), aplicando no layout da `react-grid-layout`.
  - **Gráficos**: Apache ECharts 6 (`echarts`, importação modular), com um wrapper próprio de ~40
    linhas (`useEffect` init/`setOption`/dispose). Cobre barras, colunas, linha, área, pizza/rosca e
    funil, eventos de clique (filtragem cruzada), tooltip, `aria` nativo (descrição acessível) e
    tema por tokens da marca.
  - **Tabela e tabela dinâmica**: componentes próprios em HTML (`<table>`), pivot feito no cliente
    sobre o resultado de uma consulta com 2 dimensões (limite de 50 colunas).
  - **Estado do editor**: `useReducer` com pilha de histórico (desfazer/refazer 20 passos, FR-009);
    TanStack Query para dados do servidor, como no resto do app.
  - **Exportar página** (FR-033): imagem PNG com `html-to-image` (nova dependência); PDF pelo
    diálogo de impressão do navegador (`window.print()`) com folha de estilo de impressão que
    mostra só a página do relatório, filtros ativos e data de geração.
  - **"Ver dados" em planilha** (FR-020): download CSV com BOM UTF-8 e `;` (abre certo no Excel
    em pt-BR), gerado pelo backend em streaming.
- **Alternatives considered**: `dnd-kit` (bom, mas o nativo basta para soltar em alvos fixos e a
  grade já tem o próprio arraste); Recharts (sem funil de qualidade e sem exportação; SVG pesa
  com muitos pontos); Chart.js (sem funil); jsPDF/Puppeteer para PDF (dependência grande ou
  Chromium no servidor).

## 11. Edição concorrente (FR-036) e permissões (FR-032 a FR-035)

- **Decision**: `reports.version` (inteiro). `PUT` envia a versão lida; divergente → `409
  REPORT_CONFLICT`; `force: true` sobrescreve. Permissão calculada num único helper de model:
  admin → edita tudo; dono → edita; compartilhado `edit`/`view`. Fontes internas usam as mesmas
  regras de visibilidade do CRM (hoje todo atendente ativo vê todas as conversas, feature 001
  FR-013), então não há filtro por linha nesta versão; o helper existe para quando a feature 002
  restringir por responsável.
- **Alternatives considered**: bloqueio pessimista de edição (trava relatórios se alguém fecha a
  aba); CRDT/colaboração ao vivo (fora de escopo).

## 12. Definição do relatório

- **Decision**: páginas, componentes, layout, filtros de página e campos calculados vivem numa
  coluna `reports.definition jsonb`, validada por um schema Zod único (`models/bi/definition.ts`)
  no salvar. Relatório é sempre salvo inteiro.
- **Rationale**: o editor carrega e salva o relatório inteiro; tabelas normalizadas para
  página/componente só trariam joins e migrations sem consulta que precise delas.
- **Alternatives considered**: tabelas `report_pages`/`report_visuals` (sem consulta que as
  justifique).

## Novas dependências (Princípio V)

| Pacote | App | Por quê |
|---|---|---|
| `mysql2` | backend | único driver MySQL mantido; FR-023 |
| `exceljs` | backend | leitura de `.xlsx` em streaming até 50 MB; FR-022 |
| `csv-parse` | backend | CSV com aspas, quebras de linha e separador `;` em streaming |
| `react-grid-layout` | frontend | grade com arraste, redimensionamento e compactação (FR-002) |
| `echarts` | frontend | todos os tipos de gráfico pedidos, eventos, acessibilidade |
| `html-to-image` | frontend | exportar página como imagem (FR-033) |
