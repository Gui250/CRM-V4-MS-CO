# Feature Specification: Relatórios de BI Interativos

**Feature Branch**: `004-interactive-bi-reports`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Se baseando em @.llm/prd.MD crie e implemente a criação de relatórios de BI interativos no CRM drag-and-drop funcionando como um power BI e com componentes interativos ja prontos e adaptando para os dados. Podemos puxar dados de diversas fontes, entre eles: banco de dados, planilhas, api e etc"

Trecho do PRD que esta feature cobre:

- "possibilidade de criar relatórios interativos"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Montar um relatório arrastando componentes sobre os dados do CRM (Priority: P1)

Um usuário abre a área **Relatórios**, cria um relatório novo e vê uma tela em branco com uma
paleta de componentes prontos (cartão de indicador, barras, colunas, linha, área, pizza/rosca,
funil, tabela, tabela dinâmica, filtro). Escolhe uma fonte de dados já disponível (ex.: "Conversas
do WhatsApp" ou "Leads do funil"), arrasta um componente para a tela e depois arrasta campos da
lista de campos da fonte para os espaços do componente (eixo/categoria, valor, legenda). O
componente se desenha na hora com os dados reais. O usuário move e redimensiona os componentes
numa grade, dá um título a cada um e salva o relatório.

**Why this priority**: é o núcleo "tipo Power BI" pedido; usando só as fontes internas do CRM já
entrega valor sem depender de nenhuma conexão externa.

**Independent Test**: criar o relatório "Atendimento", arrastar um cartão de indicador com
"quantidade de conversas", um gráfico de colunas com "conversas por dia" e uma tabela com
"conversas por atendente", salvar, recarregar e ver os três componentes no mesmo lugar e com os
números batendo com o painel de chat.

**Acceptance Scenarios**:

1. **Given** a área Relatórios, **When** o usuário cria um relatório, **Then** vê uma tela vazia
   em grade, a paleta de componentes e o seletor de fonte de dados com a lista de campos.
2. **Given** uma fonte escolhida, **When** o usuário arrasta um componente para a tela e arrasta
   campos para os espaços dele, **Then** o componente mostra os dados em até 3 segundos.
3. **Given** um campo numérico colocado em "valor", **When** o usuário muda a agregação (soma,
   média, contagem, contagem distinta, mínimo, máximo), **Then** o componente se redesenha com a
   nova agregação.
4. **Given** um campo de data colocado em "categoria", **When** o usuário escolhe o agrupamento
   (dia, semana, mês, trimestre, ano), **Then** o eixo passa a mostrar esses períodos em ordem
   cronológica.
5. **Given** componentes na tela, **When** o usuário os move ou redimensiona, **Then** os demais se
   reorganizam sem sobrepor e o layout é mantido ao salvar e reabrir.
6. **Given** um componente já montado, **When** o usuário troca o tipo dele (ex.: colunas →
   pizza), **Then** os campos compatíveis são mantidos e os incompatíveis ficam sinalizados.
7. **Given** um usuário que não usa mouse, **When** foca um componente ou um campo, **Then**
   consegue adicioná-lo, movê-lo e removê-lo pelo teclado ou por menu.

---

### User Story 2 - Componentes que se adaptam aos dados (Priority: P1)

Ao escolher uma fonte, o sistema reconhece o tipo de cada campo (texto, número, moeda, data,
sim/não) e sugere automaticamente o componente adequado: ao arrastar só um campo numérico para a
tela vira um cartão de indicador; data + número vira linha; texto + número vira barras; um campo
de etapa de funil vira funil. O usuário também pode escolher, na tela vazia, "gerar relatório
sugerido", que monta um primeiro rascunho com os componentes mais úteis para aquela fonte.

**Why this priority**: é o "componentes interativos já prontos e adaptando para os dados" do
pedido; reduz o trabalho de quem não é analista.

**Independent Test**: importar uma planilha de vendas com colunas "data", "vendedor", "valor",
soltar cada coluna na tela vazia e ver linha, barras e cartão de indicador sugeridos corretamente;
usar "gerar relatório sugerido" e obter um rascunho com pelo menos 4 componentes coerentes.

**Acceptance Scenarios**:

1. **Given** uma fonte nova, **When** o sistema a lê, **Then** cada campo aparece com o tipo
   reconhecido e o usuário pode corrigir o tipo manualmente.
2. **Given** a tela do relatório, **When** o usuário arrasta um campo (e não um componente) para a
   tela, **Then** um componente adequado ao tipo do campo é criado já preenchido.
3. **Given** um relatório vazio com fonte escolhida, **When** o usuário pede "gerar relatório
   sugerido", **Then** recebe um rascunho editável com indicadores, uma série temporal (se houver
   data) e um ranking (se houver categoria).
4. **Given** um componente cuja categoria tem mais de 20 valores distintos, **When** ele é
   desenhado, **Then** mostra os 20 maiores e agrupa o restante em "Outros", com opção de mudar o
   limite.

---

### User Story 3 - Interagir com o relatório: filtros e filtragem cruzada (Priority: P1)

Quem abre o relatório pronto (não só quem o criou) pode interagir: usa filtros da página
(período, atendente, etapa), clica numa barra ou fatia de um gráfico e todos os outros componentes
do relatório passam a mostrar só aquele recorte, passa o mouse para ver os valores exatos e
detalha uma data de ano para mês e de mês para dia. Uma trilha no topo mostra os filtros ativos,
que podem ser removidos um a um.

**Why this priority**: interatividade é o que diferencia um relatório de BI de uma imagem
estática; pedido explícito ("relatórios de BI interativos").

**Independent Test**: num relatório com gráfico de conversas por atendente e gráfico de conversas
por dia, clicar no atendente "Ana" e ver o gráfico por dia mostrar só as conversas dela; limpar o
filtro e ver os totais originais.

**Acceptance Scenarios**:

1. **Given** um relatório com componente de filtro de período, **When** o usuário escolhe "últimos
   30 dias", **Then** todos os componentes daquela página se atualizam em até 3 segundos.
2. **Given** um gráfico de barras, **When** o usuário clica numa barra, **Then** os demais
   componentes da página filtram por aquele valor e a barra fica destacada; clicar de novo desfaz.
3. **Given** um gráfico com data agrupada por ano, **When** o usuário pede para detalhar um ano,
   **Then** vê os meses daquele ano e pode voltar ao nível anterior.
4. **Given** filtros ativos, **When** o usuário olha a trilha de filtros, **Then** vê cada filtro
   aplicado e pode remover qualquer um individualmente.
5. **Given** um usuário que só visualiza, **When** interage com filtros, **Then** a interação não
   altera o relatório salvo para os demais.
6. **Given** um componente, **When** o usuário pede "ver dados", **Then** vê a tabela de linhas
   que formam aquele número, com opção de exportar em planilha.

---

### User Story 4 - Conectar fontes externas: planilhas, bancos de dados e APIs (Priority: P2)

O administrador abre **Fontes de dados** e conecta dados de fora do CRM:

- **Planilha**: envia um arquivo de planilha ou informa o link de uma planilha online compartilhada;
  escolhe a aba e a linha de cabeçalho.
- **Banco de dados**: informa endereço, banco, usuário e senha de um banco externo; escolhe tabelas
  ou escreve uma consulta de leitura.
- **API**: informa o endereço, o método, cabeçalhos de autenticação e onde está a lista de itens na
  resposta.

Antes de salvar, o sistema testa a conexão e mostra uma prévia das primeiras linhas com os tipos
reconhecidos. A fonte passa a aparecer para os usuários ao montar relatórios.

**Why this priority**: pedido explícito ("puxar dados de diversas fontes"), mas os relatórios já
são úteis com os dados internos (US1-US3); conexões externas trazem mais risco e vêm em seguida.

**Independent Test**: enviar uma planilha com 1.000 linhas, conectar um banco externo de teste e
uma API pública de teste; em cada caso ver a prévia, salvar e montar um gráfico com os dados.

**Acceptance Scenarios**:

1. **Given** um arquivo de planilha válido, **When** o administrador o envia, **Then** vê a prévia
   das primeiras 50 linhas com os tipos reconhecidos e pode escolher aba e linha de cabeçalho.
2. **Given** dados de conexão de banco inválidos ou banco inacessível, **When** o administrador
   testa, **Then** vê uma mensagem clara do problema (credencial, endereço, permissão) e a fonte não
   é salva.
3. **Given** uma consulta de banco que tenta alterar dados, **When** o administrador salva, **Then**
   o sistema recusa: fontes de banco só leem.
4. **Given** uma API que responde com lista de itens aninhada, **When** o administrador indica o
   caminho da lista, **Then** cada item vira uma linha e cada propriedade vira um campo.
5. **Given** credenciais salvas de banco ou API, **When** qualquer usuário abre a fonte depois,
   **Then** senhas e tokens nunca aparecem de volta por inteiro.
6. **Given** uma fonte com atualização programada (ex.: a cada hora), **When** chega o horário,
   **Then** os dados são recarregados e os relatórios passam a mostrar os novos valores, com a data
   da última atualização visível.
7. **Given** uma atualização que falha, **When** o usuário abre um relatório daquela fonte, **Then**
   vê os últimos dados válidos com aviso "dados de <data>; última atualização falhou".

---

### User Story 5 - Organizar, compartilhar e exportar relatórios (Priority: P2)

O usuário organiza relatórios com várias páginas (abas), duplica relatórios, os compartilha com
colegas definindo quem pode editar e quem só visualiza, e exporta a página atual em PDF ou imagem.
Na lista de relatórios, vê os que criou e os que foram compartilhados com ele.

**Why this priority**: torna o relatório uma ferramenta de equipe; não bloqueia o uso individual.

**Independent Test**: criar um relatório de 2 páginas, compartilhar como "somente visualizar" com
um atendente, entrar com esse atendente, interagir com os filtros e confirmar que ele não consegue
editar; exportar a página em PDF.

**Acceptance Scenarios**:

1. **Given** um relatório, **When** o dono adiciona, renomeia, reordena ou remove páginas, **Then**
   cada página tem seus próprios componentes e filtros.
2. **Given** um relatório, **When** o dono o compartilha com usuários como "editar" ou "visualizar",
   **Then** esses usuários o veem na lista com a permissão correspondente.
3. **Given** um usuário com permissão "visualizar", **When** abre o relatório, **Then** pode
   interagir com filtros mas não vê controles de edição.
4. **Given** um relatório aberto, **When** o usuário exporta a página, **Then** recebe um PDF ou
   imagem com os componentes no estado atual, incluindo filtros aplicados e a data de geração.
5. **Given** um relatório, **When** o usuário o duplica, **Then** recebe uma cópia independente da
   qual é dono.

---

### Edge Cases

- Fonte sem nenhuma linha: componentes mostram "sem dados para os filtros atuais" em vez de erro.
- Fonte removida ou campo que deixou de existir (coluna renomeada na planilha, propriedade sumiu da
  API): os componentes afetados mostram aviso com o campo que falta; o restante do relatório
  continua funcionando.
- Exclusão de uma fonte usada por relatórios: bloqueada, listando os relatórios que dependem dela.
- Valores de tipo inválido num campo numérico ou de data (ex.: "n/d"): são contados como vazios e o
  componente informa quantas linhas foram ignoradas.
- Fonte muito grande: planilhas acima de 50 MB ou 500.000 linhas são recusadas no envio com
  mensagem; consultas que levarem mais de 30 segundos são interrompidas com aviso.
- API paginada: nesta versão só a primeira resposta é lida; se o administrador indicar o parâmetro
  de página, até 50 páginas são lidas.
- API ou banco fora do ar no momento da atualização: mantém os últimos dados (US4, cenário 7).
- Dois editores alterando o mesmo relatório: ao salvar, quem salvar por último é avisado de que
  houve mudança e pode recarregar ou sobrescrever.
- Dados pessoais de contatos (nome, telefone) aparecem apenas para usuários que já podem vê-los no
  CRM; relatórios compartilhados não ampliam o acesso aos dados internos.
- Datas e moedas: exibidas no padrão brasileiro (dd/mm/aaaa, R$ 1.234,56) e fuso de Brasília,
  independentemente do formato da fonte.
- Tela pequena: em celular o relatório é exibido em uma coluna só leitura com filtros; a edição é
  feita em desktop.

## Requirements *(mandatory)*

### Functional Requirements

**Editor de relatórios**

- **FR-001**: Usuários MUST poder criar, renomear, duplicar, editar e excluir relatórios, cada um
  com uma ou mais páginas.
- **FR-002**: O editor MUST permitir arrastar componentes da paleta para uma tela em grade, mover e
  redimensionar sem sobreposição, e remover componentes.
- **FR-003**: O sistema MUST oferecer nesta versão os componentes: cartão de indicador (com
  comparação opcional com o período anterior), barras, colunas, linha, área, pizza/rosca, funil,
  tabela, tabela dinâmica (linhas × colunas × valor), filtro de lista, filtro de período e caixa de
  texto.
- **FR-004**: Cada componente MUST ter espaços de campos (categoria, valor, legenda, filtro) onde o
  usuário arrasta campos da fonte; valores aceitam as agregações soma, média, contagem, contagem
  distinta, mínimo e máximo.
- **FR-005**: Campos de data MUST poder ser agrupados por dia, semana, mês, trimestre e ano.
- **FR-006**: Cada componente MUST permitir título, ordenação, limite de itens (padrão 20 com
  "Outros") e formato de número (inteiro, decimal, moeda, percentual).
- **FR-007**: O usuário MUST poder criar campos calculados simples na fonte do relatório (operações
  aritméticas entre campos numéricos e razão entre duas agregações, ex.: taxa de conversão).
- **FR-008**: Todas as ações do editor MUST ser executáveis por teclado ou menu, além de arrastar.
- **FR-009**: O editor MUST salvar alterações explicitamente e avisar ao sair com alterações não
  salvas; deve permitir desfazer/refazer as últimas 20 ações na sessão.

**Adaptação aos dados**

- **FR-010**: O sistema MUST reconhecer automaticamente o tipo de cada campo (texto, número,
  moeda, data, data e hora, sim/não) e permitir correção manual.
- **FR-011**: Soltar um campo diretamente na tela MUST criar o componente sugerido para o tipo do
  campo; soltar campos adicionais num componente MUST ajustá-lo (ex.: data + número → linha).
- **FR-012**: O sistema MUST oferecer "gerar relatório sugerido" que monta um rascunho editável a
  partir dos campos da fonte escolhida.
- **FR-013**: O sistema MUST oferecer modelos de relatório prontos sobre os dados internos:
  "Atendimento WhatsApp" e, quando existirem as features correspondentes, "Funil de vendas" e
  "Automações".

**Interatividade**

- **FR-014**: Filtros de página MUST afetar todos os componentes da página que usam a mesma fonte
  ou fontes relacionadas pelo campo filtrado.
- **FR-015**: Clicar num elemento de um gráfico MUST filtrar os demais componentes da página
  (filtragem cruzada); o autor pode desligar esse comportamento por componente.
- **FR-016**: Gráficos com data MUST permitir detalhar e voltar nível (ano → trimestre → mês → dia).
- **FR-017**: Passar o mouse ou focar um elemento MUST mostrar rótulo e valor exatos formatados.
- **FR-018**: Uma trilha de filtros ativos MUST mostrar cada filtro aplicado com opção de remoção
  individual e de limpar todos.
- **FR-019**: Interações de quem visualiza MUST ser temporárias e não alterar o relatório salvo.
- **FR-020**: Todo componente MUST oferecer "ver dados" (linhas que compõem o valor) e exportação
  dessas linhas em planilha.

**Fontes de dados**

- **FR-021**: O sistema MUST disponibilizar como fontes internas, sem configuração, os dados do CRM:
  conversas e mensagens do WhatsApp (feature 001) e, quando existirem, leads/funis (002) e
  execuções de automação (003).
- **FR-022**: Administradores MUST poder criar fontes de planilha por envio de arquivo (formatos de
  planilha e texto separado por vírgula) ou por link de planilha online compartilhada, escolhendo
  aba e linha de cabeçalho.
- **FR-023**: Administradores MUST poder criar fontes de banco de dados externo (tipos suportados
  em Assumptions) escolhendo tabelas ou escrevendo uma consulta; o sistema MUST garantir acesso
  somente leitura e recusar comandos que alterem dados.
- **FR-024**: Administradores MUST poder criar fontes de API informando endereço, método,
  cabeçalhos, parâmetros, caminho da lista de itens na resposta e, opcionalmente, parâmetro de
  paginação.
- **FR-025**: Toda fonte MUST passar por teste de conexão e mostrar prévia de até 50 linhas antes
  de ser salva.
- **FR-026**: Senhas, tokens e chaves de fontes MUST ser guardados protegidos e nunca exibidos de
  volta por inteiro; apenas administradores podem alterá-los.
- **FR-027**: Fontes externas MUST poder ser atualizadas manualmente e de forma programada (a cada
  15 min, 1 h, 6 h ou 24 h); cada fonte mostra a data da última atualização bem-sucedida e o
  resultado da última tentativa.
- **FR-028**: Falha de atualização MUST manter os últimos dados válidos e exibir aviso nos
  relatórios que os usam.
- **FR-029**: O sistema MUST impor limites: planilhas até 50 MB e 500.000 linhas; consultas e
  chamadas de API interrompidas após 30 segundos; API paginada até 50 páginas.
- **FR-030**: Administradores MUST poder relacionar duas fontes por um campo em comum (ex.:
  telefone da planilha ↔ telefone do contato) para usá-las no mesmo componente ou filtro.
- **FR-031**: Exclusão de fonte usada por relatórios MUST ser bloqueada, listando os relatórios
  dependentes.

**Compartilhamento, exportação e acesso**

- **FR-032**: O dono MUST poder compartilhar o relatório com usuários do CRM com permissão
  "editar" ou "visualizar", e revogar o compartilhamento.
- **FR-033**: Usuários MUST poder exportar a página atual em PDF e imagem, refletindo filtros
  aplicados e com data de geração.
- **FR-034**: Administradores criam, editam e excluem fontes externas e veem todos os relatórios;
  atendentes criam relatórios sobre qualquer fonte disponível, editam os próprios e os
  compartilhados com "editar", e visualizam os compartilhados com "visualizar".
- **FR-035**: Dados internos exibidos em relatórios MUST respeitar o que o usuário já pode ver no
  CRM; compartilhar um relatório não concede acesso a dados que o destinatário não teria.
- **FR-036**: Ao salvar, o sistema MUST detectar alteração concorrente por outro editor e oferecer
  recarregar ou sobrescrever.
- **FR-037**: Números, moedas e datas MUST ser exibidos no padrão pt-BR e fuso de Brasília.

### Key Entities

- **Fonte de dados**: origem dos dados; nome, tipo (interna, planilha, banco externo, API),
  configuração de conexão, credenciais protegidas, agenda de atualização, última atualização e
  resultado.
- **Campo**: coluna de uma fonte; nome original, nome de exibição, tipo reconhecido e tipo
  corrigido; pode ser calculado (fórmula sobre outros campos).
- **Relacionamento**: ligação entre duas fontes por um campo em comum.
- **Captura de dados**: cópia dos dados de uma fonte externa obtida numa atualização; relatórios
  leem a captura mais recente válida.
- **Relatório**: nome, dono, páginas, data de criação e da última alteração, versão para detectar
  edição concorrente.
- **Página**: aba do relatório; ordem, filtros de página, componentes.
- **Componente (visual)**: tipo, posição e tamanho na grade, fonte, campos por espaço, agregações,
  agrupamento de data, formatação, título, filtragem cruzada ligada/desligada.
- **Compartilhamento**: relatório, usuário, permissão (editar ou visualizar).
- **Modelo de relatório**: relatório pronto sobre dados internos, usado como ponto de partida.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário sem treinamento monta um relatório com 3 componentes sobre os dados de
  atendimento em menos de 5 minutos.
- **SC-002**: Em 95% dos casos, componentes se desenham e filtros/cliques se refletem em todos os
  componentes da página em até 3 segundos, para fontes de até 500.000 linhas.
- **SC-003**: Um administrador conecta uma planilha, um banco externo ou uma API e vê a prévia dos
  dados em menos de 3 minutos.
- **SC-004**: Em pelo menos 90% das fontes testadas, o tipo reconhecido automaticamente está
  correto para todos os campos de número e data.
- **SC-005**: "Gerar relatório sugerido" produz um rascunho que o usuário mantém com no máximo 2
  alterações em pelo menos 70% dos casos.
- **SC-006**: Números mostrados nos relatórios sobre dados internos batem 100% com as contagens do
  próprio CRM para o mesmo período.
- **SC-007**: 0 credenciais de fontes exibidas por inteiro na interface ou em exportações.
- **SC-008**: Após 30 dias de uso, a gestão deixa de montar relatórios manuais em planilha para os
  indicadores de atendimento (medido pela adoção: pelo menos 1 relatório aberto por semana por
  gestor).

## Assumptions

- Depende da feature 001 (usuários com papéis administrador e atendente, conversas e mensagens do
  WhatsApp); fontes internas de funis (002) e automações (003) entram quando essas features
  existirem, sem mudar relatórios já criados.
- "Funcionar como um Power BI" é entendido como: editor visual de arrastar e soltar, componentes
  prontos, filtros e filtragem cruzada, detalhamento de datas, várias páginas e fontes múltiplas.
  Ficam fora desta versão: linguagem de fórmulas avançada (apenas campos calculados simples),
  modelagem com várias relações encadeadas, mapas geográficos, componentes personalizados por
  código, alertas por limite e envio de relatórios por e-mail agendado.
- Planilha online entende-se como planilha compartilhada por link de leitura (ex.: Google
  Planilhas publicada); login OAuth em contas de planilha fica para depois.
- Bancos externos suportados nesta versão: PostgreSQL e MySQL; outros depois. A empresa é
  responsável por fornecer um usuário com permissão só de leitura; o sistema ainda assim bloqueia
  comandos de escrita.
- APIs suportadas nesta versão: respostas em JSON, autenticação por cabeçalho (token/chave) ou
  parâmetro; OAuth fica para depois.
- Dados de fontes externas são copiados para o CRM a cada atualização (não consultados ao vivo a
  cada clique), para garantir velocidade e isolar os relatórios de quedas da fonte.
- Links públicos de relatório (acesso sem login) ficam fora desta versão; compartilhamento é só
  entre usuários do CRM.
- O editor é pensado para desktop; em tablet e celular relatórios são visualizados e filtrados, não
  editados.
- Interface em português do Brasil, seguindo a identidade visual V4 já definida na feature 001; as
  cores dos gráficos seguem os tokens da marca e mantêm contraste acessível.
