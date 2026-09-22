# Feature Specification: Fluxos de Automação e Agentes de IA

**Feature Branch**: `003-automation-flows-ai-agents`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Criação de fluxos de automação e agentes de ia tipo n8n tenha como base o @.llm/prd.MD"

Trechos do PRD que esta feature cobre:

- "possibilidade de criar fluxos de automação dentro do proprio crm similar a um n8n, por exemplo:
  agentes de IA com possibilidade de conexão via multiplos provedores, passar atendimento ao humano
  e etc. Pode ter a funcionalidade de ativar ou desativar o agente"
- "quero que o chat do whatsapp quero que tenha a possibilidade de disparar os fluxos necessários
  para fazer abordagem e afins"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Montar um fluxo visual e ativá-lo (Priority: P1)

Um administrador abre a área **Automações**, cria um fluxo novo e o monta num editor visual no
estilo n8n: arrasta blocos para uma área de trabalho e liga uns aos outros com setas. Todo fluxo
começa por um único **gatilho** (ex.: "mensagem recebida de contato novo") seguido de **ações**
(enviar mensagem, esperar, decidir por condição). O administrador salva, ativa o fluxo e, a partir
daí, ele roda sozinho sempre que o gatilho acontecer.

**Why this priority**: é o núcleo da feature; sem o editor e a execução de fluxos, agentes de IA e
disparos pelo chat não têm onde viver.

**Independent Test**: criar o fluxo "boas-vindas" (gatilho: primeira mensagem de um contato novo →
esperar 5 segundos → enviar texto de boas-vindas), ativar, mandar mensagem de um número nunca visto
e confirmar que a resposta chega ao celular e aparece no painel de chat.

**Acceptance Scenarios**:

1. **Given** a área Automações, **When** o administrador cria um fluxo, **Then** vê uma área de
   trabalho vazia com uma paleta de blocos (gatilhos e ações) que pode arrastar e conectar.
2. **Given** um fluxo em edição, **When** o administrador conecta blocos e salva, **Then** o fluxo
   fica salvo como rascunho e continua inativo.
3. **Given** um fluxo sem gatilho, com bloco desconectado ou com campo obrigatório vazio, **When**
   o administrador tenta ativar, **Then** a ativação é bloqueada e os blocos com problema são
   destacados com a explicação.
4. **Given** um fluxo ativo com gatilho "mensagem recebida", **When** um contato envia mensagem que
   atende ao gatilho, **Then** o fluxo executa as ações em ordem e as mensagens enviadas aparecem
   no painel de chat identificadas como enviadas pela automação.
5. **Given** um bloco "condição" (ex.: mensagem contém "preço"), **When** o fluxo chega nele,
   **Then** segue pelo caminho "sim" ou "não" conforme o resultado.
6. **Given** um fluxo ativo, **When** o administrador o desativa, **Then** nenhuma nova execução
   começa; execuções em andamento são encerradas antes da próxima ação.
7. **Given** um fluxo ativo, **When** o administrador edita e salva, **Then** novas execuções usam
   a versão nova e execuções já em andamento terminam na versão em que começaram.

---

### User Story 2 - Agente de IA respondendo conversas (Priority: P1)

O administrador cadastra as credenciais de um ou mais provedores de IA e cria um **agente**:
dá um nome, escolhe provedor e modelo e escreve as instruções (personalidade, o que pode ou não
responder, quando passar para um humano). Coloca o agente num fluxo como um bloco. Quando o fluxo
roda, o agente lê o histórico recente da conversa e responde ao contato pelo WhatsApp, mantendo a
conversa até concluir ou até precisar de um humano. O agente pode ser ativado e desativado a
qualquer momento.

**Why this priority**: é o principal pedido do PRD (agentes de IA com múltiplos provedores e
ativar/desativar); entrega atendimento 24h sem aumentar a equipe.

**Independent Test**: cadastrar um provedor, criar um agente de qualificação, ligá-lo a um fluxo
com gatilho "mensagem recebida", mandar perguntas de um celular externo e verificar respostas
coerentes com as instruções no WhatsApp e no painel.

**Acceptance Scenarios**:

1. **Given** credenciais de provedor cadastradas, **When** o administrador cria um agente
   escolhendo provedor, modelo e instruções, **Then** o agente fica disponível como bloco no
   editor de fluxos.
2. **Given** credenciais inválidas, **When** o administrador salva o provedor, **Then** o sistema
   testa a conexão e mostra que falhou antes de permitir o uso.
3. **Given** uma conversa atendida pelo agente, **When** o contato envia nova mensagem, **Then** o
   agente responde considerando o histórico recente da conversa, em até 15 segundos.
4. **Given** um agente ativo, **When** o administrador o desativa, **Then** ele para de responder
   imediatamente em todas as conversas e os fluxos que o usam seguem pelo caminho de "agente
   indisponível" (ou param, se esse caminho não existir).
5. **Given** um agente em uso, **When** o administrador troca o provedor ou modelo, **Then** as
   próximas respostas usam a nova configuração sem precisar recriar o agente ou o fluxo.
6. **Given** o provedor de IA falha ou demora demais, **When** o agente tenta responder, **Then**
   nenhuma mensagem quebrada é enviada ao contato, a falha fica registrada e a conversa é passada
   para atendimento humano.

---

### User Story 3 - Passar o atendimento para um humano (Priority: P1)

Durante uma conversa automatizada, o atendimento pode ser passado para um humano: porque o agente
de IA decidiu (seguindo suas instruções), porque o fluxo chegou num bloco "passar para humano", ou
porque o próprio atendente assumiu no painel de chat. A partir daí a automação se cala naquela
conversa, a conversa fica sinalizada para a equipe e o atendente vê um resumo do que já foi dito.
O atendente pode devolver a conversa para a automação quando quiser.

**Why this priority**: sem passagem segura para o humano, o agente de IA não pode ir para produção;
é também pedido explícito do PRD.

**Independent Test**: com um agente ativo, pedir "quero falar com uma pessoa" pelo celular e
confirmar que o agente para de responder, a conversa aparece sinalizada no painel e que o atendente
responde normalmente.

**Acceptance Scenarios**:

1. **Given** uma conversa atendida pela automação, **When** o agente decide passar para humano ou
   o fluxo chega no bloco "passar para humano", **Then** a automação para naquela conversa e ela
   aparece no painel com o selo "aguardando humano" e o motivo da passagem.
2. **Given** uma conversa atendida pela automação, **When** um atendente envia uma mensagem pelo
   painel ou clica em "assumir", **Then** a automação para naquela conversa imediatamente.
3. **Given** uma conversa em atendimento humano, **When** o contato envia novas mensagens, **Then**
   nenhum fluxo ou agente responde, exceto se o atendente devolver a conversa para a automação.
4. **Given** uma conversa passada para humano, **When** o atendente a abre, **Then** vê no topo um
   resumo da conversa até ali e qual fluxo/agente atendeu.
5. **Given** uma conversa em atendimento humano, **When** o atendente clica em "devolver para
   automação", **Then** a próxima mensagem do contato volta a disparar os fluxos normalmente.
6. **Given** a lista de conversas, **When** o atendente filtra por "aguardando humano", **Then**
   vê apenas conversas passadas pela automação que ninguém assumiu ainda.

---

### User Story 4 - Disparar um fluxo a partir do chat (Priority: P2)

No painel de chat, o atendente abre uma conversa e escolhe um fluxo de abordagem (ex.: "follow-up
de proposta", "reativação de lead") para rodar naquele contato. O fluxo roda do início com os dados
daquele contato, e o atendente acompanha no próprio chat o que foi enviado. Também pode iniciar uma
conversa nova com um número ainda sem histórico disparando um fluxo de abordagem.

**Why this priority**: pedido explícito do PRD ("disparar os fluxos necessários para fazer
abordagem"), mas depende das histórias 1 e 2 para existir.

**Independent Test**: criar um fluxo com gatilho "disparo manual", abrir uma conversa no painel,
disparar o fluxo e confirmar que as mensagens chegam ao celular do contato.

**Acceptance Scenarios**:

1. **Given** fluxos ativos com gatilho "disparo manual", **When** o atendente abre o menu de
   automações numa conversa, **Then** vê apenas esses fluxos, com nome e descrição.
2. **Given** o atendente escolheu um fluxo, **When** confirma o disparo, **Then** o fluxo começa
   naquela conversa e a conversa mostra um indicador "automação em andamento" com opção de parar.
3. **Given** o mesmo fluxo já está rodando naquela conversa, **When** o atendente tenta dispará-lo
   de novo, **Then** o sistema avisa e não inicia uma segunda execução.
4. **Given** um número de WhatsApp sem conversa no CRM, **When** o atendente informa o número e
   dispara um fluxo de abordagem, **Then** a conversa é criada e o fluxo roda nela.

---

### User Story 5 - Acompanhar execuções e corrigir problemas (Priority: P2)

O administrador vê o histórico de execuções de cada fluxo: quando rodou, em qual conversa, por
quais blocos passou, quanto tempo levou e onde falhou. Antes de ativar, pode testar o fluxo num
número de teste para ver o caminho percorrido.

**Why this priority**: automações falham em silêncio; sem visibilidade o administrador não confia
em deixar o fluxo ligado. Não bloqueia o uso básico.

**Independent Test**: provocar uma falha (ex.: agente com provedor fora do ar), abrir o histórico
do fluxo e encontrar a execução falha com o bloco e o motivo.

**Acceptance Scenarios**:

1. **Given** um fluxo que já rodou, **When** o administrador abre o histórico, **Then** vê as
   execuções mais recentes primeiro, com situação (em andamento, concluída, falhou, interrompida),
   conversa, início e duração.
2. **Given** uma execução, **When** o administrador a abre, **Then** vê o fluxo com o caminho
   percorrido destacado e, em cada bloco, o que entrou, o que saiu e erros.
3. **Given** um fluxo em rascunho, **When** o administrador usa "testar" informando um número de
   teste, **Then** o fluxo roda de verdade só para esse número e o caminho aparece em tempo real.

---

### Edge Cases

- Duas automações disparadas pela mesma mensagem: só um fluxo por conversa roda por vez; havendo
  mais de um fluxo ativo cujo gatilho coincide, vale o de maior prioridade definida pelo
  administrador, e os demais não iniciam.
- Laço infinito (fluxo que dispara a si mesmo ou volta para um bloco anterior sem espera):
  execuções que passem de 100 blocos percorridos são interrompidas e marcadas como falha.
- Contato manda várias mensagens seguidas enquanto o agente ainda está respondendo: as mensagens
  são respondidas juntas numa só resposta, não uma resposta por mensagem.
- Mensagens da própria automação ou do próprio número não disparam gatilhos de "mensagem recebida".
- Número de WhatsApp desconectado durante uma execução: o envio falha, a execução é marcada como
  falha e a conversa vai para atendimento humano; nada é reenviado automaticamente depois.
- Bloco "esperar" longo (ex.: 2 dias) e o contato responde antes: a execução segue esperando e a
  nova mensagem só dispara outros fluxos se a conversa não tiver execução em andamento. O bloco
  "esperar resposta" é o caminho para reagir à resposta.
- Fluxo excluído com execuções em andamento: exclusão bloqueada até desativar; ao desativar as
  execuções em andamento são interrompidas.
- Credenciais de um provedor removidas enquanto agentes o usam: remoção bloqueada, listando os
  agentes que dependem dele.
- Agente responde algo fora das instruções: o risco é mitigado pelas instruções e pela passagem ao
  humano; cada resposta do agente fica marcada como "IA" no painel para a equipe revisar.
- Contato pede para não receber mais mensagens ("parar", "sair"): o contato fica marcado como
  "não automatizar" e nenhum fluxo roda nele até um atendente desfazer.
- Grupos do WhatsApp: continuam fora de escopo (como na feature 001); nenhum fluxo roda neles.

## Requirements *(mandatory)*

### Functional Requirements

**Editor e ciclo de vida de fluxos**

- **FR-001**: Administradores MUST poder criar, renomear, duplicar, editar e excluir fluxos em um
  editor visual com blocos arrastáveis e conexões entre eles, com zoom e movimentação da área.
- **FR-002**: Todo fluxo MUST ter exatamente um gatilho e pode ter qualquer quantidade de ações;
  blocos de decisão têm uma saída por caminho.
- **FR-003**: O sistema MUST oferecer nesta versão os gatilhos: mensagem recebida (com filtros
  opcionais: primeira mensagem de contato novo, contém palavra-chave, qualquer mensagem) e disparo
  manual pelo chat.
- **FR-004**: O sistema MUST oferecer nesta versão as ações: enviar mensagem de texto (com
  variáveis do contato, ex.: nome), enviar imagem/documento, esperar tempo fixo, esperar resposta
  do contato (com tempo limite e caminho de "sem resposta"), condição (sim/não sobre o texto da
  mensagem ou dados do contato), agente de IA, passar para humano e encerrar.
- **FR-005**: Fluxos MUST ter situação rascunho, ativo ou inativo; só fluxos válidos (FR-006)
  podem ser ativados, e ativar/desativar vale imediatamente.
- **FR-006**: O sistema MUST validar o fluxo antes de ativar: gatilho presente, todos os blocos
  conectados, campos obrigatórios preenchidos, agentes referenciados ativos; problemas são
  mostrados no próprio bloco.
- **FR-007**: Editar um fluxo ativo MUST criar uma nova versão; execuções em andamento terminam na
  versão em que começaram.
- **FR-008**: Administradores MUST poder definir a prioridade entre fluxos ativos com gatilhos que
  podem coincidir.

**Execução**

- **FR-009**: O sistema MUST executar fluxos ativos automaticamente quando o gatilho acontecer,
  com no máximo uma execução em andamento por conversa.
- **FR-010**: Mensagens enviadas por automação MUST aparecer no painel de chat identificadas como
  "Automação: <nome do fluxo>" ou "IA: <nome do agente>".
- **FR-011**: O sistema MUST interromper execuções que passem de 100 blocos percorridos e
  registrá-las como falha.
- **FR-012**: Execuções pausadas em blocos de espera MUST continuar no horário certo mesmo após
  reinício do sistema, com tolerância de até 1 minuto.
- **FR-013**: O sistema MUST registrar cada execução (fluxo, versão, conversa, início, fim,
  situação, blocos percorridos com entradas, saídas e erros) e mantê-la consultável por 90 dias.
- **FR-014**: Administradores MUST poder testar um fluxo em rascunho contra um número de teste
  informado, vendo o caminho percorrido em tempo real.

**Agentes de IA e provedores**

- **FR-015**: Administradores MUST poder cadastrar credenciais de mais de um provedor de IA, com
  teste de conexão ao salvar; as credenciais nunca são exibidas de volta por inteiro depois de
  salvas.
- **FR-016**: Administradores MUST poder criar, editar, ativar, desativar e excluir agentes, cada
  um com nome, provedor, modelo, instruções e quantidade de mensagens do histórico que ele lê.
- **FR-017**: O agente MUST responder usando as instruções e o histórico recente da conversa, e
  MUST poder decidir passar a conversa para humano, informando o motivo.
- **FR-018**: Desativar um agente MUST fazê-lo parar de responder em todas as conversas
  imediatamente; o bloco de agente num fluxo tem um caminho opcional para "agente indisponível".
- **FR-019**: Falha ou demora acima de 30 segundos do provedor MUST resultar em nenhuma mensagem
  enviada ao contato, registro da falha e passagem da conversa para humano.
- **FR-020**: Mensagens seguidas do contato recebidas enquanto o agente processa MUST ser
  respondidas em uma única resposta.

**Atendimento humano e chat**

- **FR-021**: Cada conversa MUST ter um modo de atendimento: automação ou humano. Em modo humano
  nenhum fluxo automático ou agente responde.
- **FR-022**: A conversa MUST passar para modo humano quando: o agente decidir, o fluxo chegar no
  bloco "passar para humano", uma falha de agente ocorrer (FR-019), ou um atendente enviar
  mensagem ou clicar em "assumir" no painel.
- **FR-023**: Conversas passadas pela automação e ainda não assumidas MUST aparecer com selo
  "aguardando humano" e motivo, e a lista de conversas MUST permitir filtrar por esse estado.
- **FR-024**: Ao abrir uma conversa passada pela automação, o atendente MUST ver um resumo da
  conversa até a passagem e qual fluxo/agente atendeu.
- **FR-025**: Atendentes MUST poder devolver uma conversa para o modo automação.
- **FR-026**: Atendentes MUST poder disparar, de dentro de uma conversa, qualquer fluxo ativo com
  gatilho "disparo manual", ver que há automação em andamento e interrompê-la.
- **FR-027**: Atendentes MUST poder iniciar uma conversa com um número novo disparando um fluxo de
  disparo manual.
- **FR-028**: Contatos que pedirem para não receber mensagens (palavras "parar", "sair",
  "descadastrar") MUST ser marcados como "não automatizar"; nenhum fluxo roda neles até um
  atendente desfazer a marcação.

**Acesso**

- **FR-029**: Apenas administradores criam, editam, ativam e excluem fluxos, agentes e credenciais
  de provedores; atendentes podem apenas disparar fluxos de disparo manual, assumir e devolver
  conversas e ver o histórico de execuções das conversas que abrem.

### Key Entities

- **Fluxo**: automação montada no editor; nome, descrição, situação (rascunho, ativo, inativo),
  prioridade, versão atual.
- **Versão do fluxo**: cópia imutável dos blocos e conexões de um fluxo no momento em que foi
  salvo; execuções apontam para uma versão.
- **Bloco**: passo de um fluxo; tipo (gatilho ou ação específica), configuração, posição na área
  de trabalho, conexões de saída.
- **Execução**: uma rodada de um fluxo numa conversa; versão usada, situação (em andamento,
  esperando, concluída, falhou, interrompida), início, fim, passos percorridos.
- **Passo de execução**: registro de um bloco executado; entrada, saída, erro, horário.
- **Provedor de IA**: credencial de acesso a um fornecedor de modelos de IA; nome, fornecedor,
  situação do teste de conexão.
- **Agente de IA**: nome, provedor, modelo, instruções, tamanho do histórico lido, ativo/inativo.
- **Modo de atendimento da conversa**: automação ou humano; motivo e momento da última passagem,
  quem assumiu. Estende a Conversa da feature 001.
- **Marcação "não automatizar"**: no Contato da feature 001; quem/quando marcou.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um administrador sem treinamento monta e ativa um fluxo de boas-vindas de 3 blocos
  em menos de 5 minutos.
- **SC-002**: Em 95% dos casos, a primeira ação de um fluxo acontece em até 5 segundos após o
  gatilho.
- **SC-003**: Em 95% dos casos, o agente de IA responde ao contato em até 15 segundos.
- **SC-004**: 100% das conversas em modo humano ficam sem nenhuma mensagem automática enviada
  depois da passagem.
- **SC-005**: Um atendente dispara um fluxo de abordagem a partir de uma conversa em menos de
  10 segundos.
- **SC-006**: Um administrador encontra o bloco e o motivo de uma execução falha em menos de
  1 minuto a partir da lista de fluxos.
- **SC-007**: Pelo menos 40% das conversas novas são concluídas pela automação sem passagem para
  humano após 30 dias de uso.
- **SC-008**: Trocar o provedor de um agente leva menos de 1 minuto e não exige alterar nenhum
  fluxo.

## Assumptions

- Depende da feature 001 (painel de chat, conexão de WhatsApp, usuários com papéis de
  administrador e atendente); o WhatsApp continua sendo o único canal de entrada e saída.
- Provedores de IA iniciais: OpenAI, Anthropic e Google Gemini; novos provedores entram depois sem
  mudar fluxos ou agentes já criados. A empresa contrata e paga os provedores diretamente.
- O agente de IA nesta versão só conversa (lê histórico e responde, ou passa para humano); dar a
  ele ferramentas (consultar agenda, criar lead, buscar em documentos) fica para versões futuras.
- Integrações dos fluxos com pipelines/funis (feature 002), Calendly e relatórios ficam para quando
  essas features existirem; blocos de chamada a sistemas externos (requisição HTTP, webhooks de
  saída) e gatilhos por agenda (cron) ficam fora desta versão.
- Disparo em massa (vários contatos de uma vez) fica fora; o disparo manual é conversa a conversa,
  o que também reduz o risco de bloqueio do número pelo WhatsApp.
- O editor visual é pensado para desktop; em tablet e celular os fluxos podem ser vistos e
  ativados/desativados, mas não editados.
- Resumo da conversa na passagem para humano (FR-024) é gerado pelo mesmo provedor do agente
  quando houver agente; em fluxos sem agente, mostra as últimas mensagens trocadas.
- Interface em português do Brasil, seguindo a identidade visual V4 já definida na feature 001.
