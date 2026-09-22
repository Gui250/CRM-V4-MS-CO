# Feature Specification: Construtor Intuitivo de Agentes de IA

**Feature Branch**: `006-ai-agent-builder`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Veja a ferramenta de implementar agentes de IA, quero que seja altamente intuitivo, quero que tenha na UI a funcionalidade de passar para atendente humano caso o lead peça e etc"

## Diagnóstico

A ferramenta de agentes de IA entregue pela feature 003 (`specs/003-automation-flows-ai-agents/`)
é um formulário técnico: nome, provedor, modelo, uma caixa de texto livre de "Instruções" e um
número de "mensagens do histórico lidas". Tudo o que define o comportamento do agente, inclusive
**quando passar a conversa para um atendente humano**, depende de o administrador escrever isso em
prosa dentro das instruções. Não há como saber, olhando a tela, se o agente vai transferir quando o
lead pedir, o que ele diz ao lead nessa hora, nem como testar isso antes de ligar no WhatsApp.
Para o agente atender de fato, ainda é preciso montar um fluxo à parte no editor visual.

Esta feature redesenha a experiência de criar e operar um agente para que um administrador sem
conhecimento técnico monte um agente pronto para atender em poucos minutos, com as regras de
passagem para humano visíveis e configuráveis na própria interface. O motor de execução, os
provedores de IA e o modo de atendimento das conversas continuam os da feature 003.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Criar um agente respondendo perguntas simples (Priority: P1)

Um administrador abre **Agentes**, clica em "Novo agente" e é guiado por etapas curtas, em
linguagem de negócio: (1) nome e objetivo do agente (escolhe entre "qualificar leads", "tirar
dúvidas", "agendar reunião" ou "personalizado"), (2) tom de voz (opções prontas, ex.: amigável,
formal, direto), (3) sobre a empresa (o que vende, para quem, o que o agente não deve prometer),
(4) regras de passagem para humano (história 2) e (5) revisão. Provedor e modelo já vêm
preenchidos com uma opção recomendada; quem quiser troca em um campo "Avançado". Ao concluir, o
agente está salvo e pode ser testado ou colocado para atender.

**Why this priority**: é o pedido central ("altamente intuitivo"); sem isso o restante da feature
continua escondido atrás de um formulário técnico.

**Independent Test**: um administrador que nunca viu a tela cria um agente de qualificação
completo, sem escrever nenhuma instrução em prosa, em menos de 5 minutos, e o agente aparece na
lista pronto para uso.

**Acceptance Scenarios**:

1. **Given** a área Agentes, **When** o administrador clica em "Novo agente", **Then** vê a primeira
   etapa do assistente com indicação de quantas etapas faltam e pode avançar e voltar sem perder o
   que preencheu.
2. **Given** um provedor de IA cadastrado, **When** o administrador chega à revisão, **Then**
   provedor e modelo já estão preenchidos com a opção recomendada e ficam ocultos atrás de
   "Avançado".
3. **Given** nenhum provedor cadastrado, **When** o administrador inicia o assistente, **Then** é
   avisado no primeiro passo e levado a cadastrar um provedor sem perder o que já preencheu.
4. **Given** uma etapa com campo obrigatório vazio, **When** o administrador tenta avançar, **Then**
   o campo é destacado com a explicação e o avanço é bloqueado.
5. **Given** um agente já existente, **When** o administrador o abre, **Then** vê as mesmas etapas
   preenchidas e pode alterar qualquer uma, e as alterações valem para as próximas respostas em
   até 1 minuto.
6. **Given** a revisão, **When** o administrador abre "Ver instruções completas", **Then** vê o
   texto final que o agente vai seguir, gerado a partir das respostas, e pode adicionar instruções
   extras sem editar o texto gerado.

---

### User Story 2 - Definir na tela quando passar para um atendente humano (Priority: P1)

Na etapa "Passar para atendente", o administrador liga ou desliga, com um clique, cada situação em
que o agente deve transferir a conversa: quando o lead pedir para falar com uma pessoa (ligado por
padrão e não pode ser desligado), quando o agente não souber responder, quando o lead demonstrar
intenção de compra ou pedir proposta, quando o lead usar palavras-chave escolhidas pelo
administrador, e quando o lead demonstrar irritação. Para cada transferência o administrador
define a mensagem que o lead recebe (ex.: "Vou chamar um consultor para continuar com você") e o
que fazer fora do horário de atendimento (mensagem de aviso e transferência mesmo assim, ou só a
mensagem).

**Why this priority**: é o pedido explícito do usuário e o requisito de segurança para deixar um
agente em produção; hoje depende de prosa livre e não é verificável.

**Independent Test**: com a regra "lead pediu uma pessoa" ligada, mandar "quero falar com um
humano" de um celular externo e confirmar que o lead recebe a mensagem de transferência, o agente
para de responder e a conversa aparece no painel como "aguardando humano" com o motivo "O lead
pediu para falar com uma pessoa".

**Acceptance Scenarios**:

1. **Given** a etapa "Passar para atendente", **When** o administrador a abre pela primeira vez,
   **Then** "quando o lead pedir para falar com uma pessoa" já está ligado e marcado como
   obrigatório, e as demais situações aparecem desligadas com uma frase explicando cada uma.
2. **Given** a regra "lead pediu uma pessoa" ligada, **When** um lead escreve qualquer pedido
   equivalente ("quero falar com alguém", "me chama um atendente", "tem alguém aí?"), **Then** o
   agente envia a mensagem de transferência configurada, para de responder e a conversa passa
   para atendimento humano com esse motivo.
3. **Given** a regra "palavras-chave" ligada com a lista "cancelar, reclamação", **When** o lead
   envia mensagem contendo uma delas, **Then** a conversa é transferida com o motivo "Palavra-chave:
   <palavra>".
4. **Given** a regra "intenção de compra" ligada, **When** o lead pede preço final ou proposta,
   **Then** a conversa é transferida com o motivo "O lead quer fechar" e um resumo do que ele quer.
5. **Given** a regra "não souber responder" desligada, **When** o agente não tem a informação,
   **Then** ele diz que vai verificar e transfere mesmo assim (comportamento de segurança), com o
   motivo "O agente não soube responder".
6. **Given** horário de atendimento definido (ex.: seg-sex 9h-18h) e a opção "fora do horário,
   avisar e transferir" escolhida, **When** um lead pede uma pessoa às 22h, **Then** recebe a
   mensagem de fora do horário e a conversa fica aguardando humano para o próximo dia útil.
7. **Given** a mensagem de transferência em branco, **When** o administrador tenta concluir a etapa,
   **Then** é bloqueado e vê uma sugestão de mensagem pronta para usar com um clique.

---

### User Story 3 - Testar o agente antes de ligar (Priority: P2)

Dentro do assistente (e na página do agente), o administrador abre "Testar agente": uma janela de
chat de simulação onde ele conversa como se fosse um lead. As respostas usam a configuração atual,
inclusive alterações ainda não salvas, e cada momento em que o agente transferiria para humano
aparece destacado com o motivo, sem nada ser enviado ao WhatsApp nem contar como conversa real.

**Why this priority**: é o que dá confiança para ativar; sem teste, a única forma de validar as
regras de passagem é com um cliente de verdade.

**Independent Test**: no chat de simulação, escrever "quero falar com uma pessoa" e ver a resposta
de transferência com o destaque "Aqui o agente transferiria para um atendente: O lead pediu para
falar com uma pessoa".

**Acceptance Scenarios**:

1. **Given** o assistente com todas as etapas preenchidas, **When** o administrador abre "Testar
   agente" e envia uma mensagem, **Then** recebe a resposta em até 15 segundos, usando a
   configuração atual mesmo sem salvar.
2. **Given** uma simulação em andamento, **When** uma regra de transferência dispara, **Then** o
   ponto da conversa é destacado com o motivo e a simulação avisa que, no WhatsApp, o agente teria
   parado aqui; o administrador pode reiniciar a simulação.
3. **Given** uma simulação, **When** o administrador fecha e volta ao assistente, **Then** nenhum
   registro aparece no painel de chat, no histórico de execuções nem nas métricas do agente.
4. **Given** o provedor de IA fora do ar, **When** o administrador envia uma mensagem de teste,
   **Then** vê um aviso claro de que o provedor não respondeu, com a opção de tentar de novo.

---

### User Story 4 - Colocar o agente para atender com um clique (Priority: P2)

Na página do agente há um controle "Atender conversas novas". Ao ligá-lo, o administrador escolhe
o alcance (todas as conversas novas, ou só as que chegarem com determinadas palavras) e o agente
passa a responder automaticamente, sem precisar montar um fluxo no editor visual. Ao desligar, o
agente para de pegar conversas novas; as que já estão com ele continuam até terminar ou serem
transferidas. Quem quiser mais controle continua podendo usar o agente como bloco em um fluxo.

**Why this priority**: hoje, mesmo com o agente criado, ele não atende ninguém até alguém montar um
fluxo; isso derruba a intuitividade pedida. Depende da história 1.

**Independent Test**: ligar "Atender conversas novas" em um agente e mandar mensagem de um número
nunca visto; confirmar que o agente responde no WhatsApp e no painel, identificado como "IA:
<nome do agente>".

**Acceptance Scenarios**:

1. **Given** um agente salvo e um número de WhatsApp conectado, **When** o administrador liga
   "Atender conversas novas" com alcance "todas", **Then** a próxima mensagem de um contato sem
   conversa em andamento é respondida pelo agente.
2. **Given** dois agentes com "Atender conversas novas" ligado, **When** o administrador liga o
   segundo, **Then** é avisado do conflito e escolhe qual tem prioridade ou restringe o alcance
   por palavras.
3. **Given** um agente atendendo, **When** o administrador desliga "Atender conversas novas",
   **Then** nenhuma conversa nova vai para ele e as conversas em andamento seguem normalmente.
4. **Given** um agente atendendo por este controle, **When** o administrador abre a área Fluxos,
   **Then** vê o atendimento desse agente listado como um fluxo gerenciado pelo agente, que não
   pode ser editado no editor visual, apenas visto e desligado.
5. **Given** um agente inativo ou excluído, **When** ele tinha "Atender conversas novas" ligado,
   **Then** o controle é desligado junto e as conversas em andamento passam para atendimento
   humano com o motivo "Agente desativado".

---

### User Story 5 - Atendente recebe e assume a transferência sem esforço (Priority: P2)

Quando o agente transfere uma conversa, o atendente percebe na hora: a conversa sobe para o topo
da lista com o selo "Aguardando humano", o menu lateral mostra quantas conversas aguardam e um
aviso sonoro opcional toca. Ao abrir, o atendente vê no topo por que a conversa chegou (ex.: "O
lead pediu para falar com uma pessoa"), a última mensagem do lead citada, quem atendeu (o agente)
e um resumo; assume com um clique e responde. Ao terminar, pode devolver ao agente.

**Why this priority**: a passagem para humano só resolve o problema do lead se alguém atender; o
"e etc" do pedido cobre esse lado da experiência. Reaproveita o modo de atendimento da feature 003.

**Independent Test**: provocar uma transferência pelo celular e, em outro navegador logado como
atendente, confirmar contador no menu, conversa no topo, motivo e citação visíveis e assunção em
um clique.

**Acceptance Scenarios**:

1. **Given** um atendente com o painel aberto, **When** o agente transfere uma conversa, **Then** em
   até 3 segundos a conversa aparece no topo da lista com o selo e o contador do menu aumenta.
2. **Given** uma conversa transferida, **When** o atendente a abre, **Then** vê motivo, mensagem do
   lead que causou a transferência, nome do agente e resumo, e o botão "Assumir" em destaque.
3. **Given** o atendente assumiu, **When** outro atendente abre a mesma conversa, **Then** vê quem
   assumiu e não recebe mais o contador por ela.
4. **Given** um atendente com o aviso sonoro ligado nas preferências, **When** uma transferência
   chega, **Then** o som toca uma vez; com o aviso desligado, nada toca.
5. **Given** a conversa assumida e resolvida, **When** o atendente clica em "Devolver para o
   agente", **Then** a próxima mensagem do lead volta a ser respondida pelo agente.

---

### User Story 6 - Acompanhar como o agente está indo (Priority: P3)

A lista de agentes vira um painel: cada agente aparece como um cartão com situação (atendendo,
pausado, sem provedor), conversas atendidas hoje e nos últimos 7 dias, quantas terminaram sem
humano, quantas foram transferidas e os motivos mais comuns. Um clique leva às conversas que
aquele agente transferiu.

**Why this priority**: mostra ao administrador se as regras de transferência estão calibradas
(transferindo demais ou de menos). Não bloqueia o uso.

**Independent Test**: após 5 conversas simuladas com um agente (3 concluídas, 2 transferidas),
abrir a área Agentes e conferir os números no cartão.

**Acceptance Scenarios**:

1. **Given** a área Agentes, **When** o administrador a abre, **Then** vê um cartão por agente com
   situação e os números do dia e dos últimos 7 dias.
2. **Given** um cartão com transferências, **When** o administrador clica em "Ver transferências",
   **Then** vai para a lista de conversas filtrada por aquele agente e por "transferidas".
3. **Given** um agente cujo provedor falhou no último teste de conexão, **When** o administrador vê
   o cartão, **Then** o cartão mostra "provedor com problema" com atalho para o provedor.

---

### Edge Cases

- Lead pede uma pessoa em áudio ou imagem: o agente não interpreta mídia; responde pedindo para
  escrever e, se o lead insistir com mídia duas vezes seguidas, transfere com o motivo "Lead enviou
  mídia que o agente não entende".
- Lead pede uma pessoa e depois diz "deixa, pode continuar": a conversa já foi transferida; só um
  atendente devolve ao agente. O agente não volta sozinho.
- Ninguém assume a conversa transferida: ela continua "aguardando humano" e no contador; o lead não
  recebe nenhuma mensagem automática extra além da de transferência e, se configurada, da de fora
  do horário.
- Transferência fora do horário com opção "só avisar": a conversa fica aguardando humano do mesmo
  jeito; a diferença é apenas a mensagem enviada ao lead.
- Administrador tenta desligar a regra obrigatória: não é possível; o controle aparece ligado e
  travado, com a explicação.
- Mensagem de transferência com variáveis (ex.: nome do lead) e lead sem nome: usa o telefone,
  como as demais mensagens de automação.
- Palavras-chave com acento, maiúsculas ou dentro de outras palavras: a comparação ignora acentos e
  caixa e considera palavra inteira ("cancela" não dispara "cancelar").
- Alteração das regras enquanto o agente conversa com alguém: vale a partir da próxima resposta
  daquela conversa.
- Simulação aberta por dois administradores ao mesmo tempo: cada um tem a sua, sem interferência.
- Provedor sem modelo recomendado disponível: o assistente pede para escolher o modelo na etapa de
  revisão em vez de esconder o campo.
- "Atender conversas novas" ligado e o número de WhatsApp desconectado: o controle mostra aviso
  "número desconectado" e o agente volta a atender quando a conexão voltar.
- Contato marcado como "não automatizar" (feature 003): o agente nunca o atende, mesmo com
  "Atender conversas novas" ligado.

## Requirements *(mandatory)*

### Functional Requirements

**Assistente de criação e edição**

- **FR-001**: O sistema MUST oferecer um assistente em etapas para criar e editar agentes, com
  indicação de progresso, navegação para frente e para trás sem perda de dados e rascunho mantido
  até o administrador concluir ou descartar.
- **FR-002**: O assistente MUST coletar, em campos de escolha ou texto curto: nome, objetivo
  (qualificar leads, tirar dúvidas, agendar reunião, personalizado), tom de voz, informações da
  empresa (o que vende, para quem, o que não prometer), regras de passagem para humano (FR-006 a
  FR-011) e instruções extras opcionais.
- **FR-003**: O sistema MUST gerar as instruções completas do agente a partir das respostas e
  mostrá-las na revisão, somente leitura, com espaço separado para instruções extras; o texto
  gerado é regenerado sempre que uma resposta muda.
- **FR-004**: Provedor e modelo MUST vir preenchidos com uma opção recomendada e ficar ocultos atrás
  de "Avançado"; quando não houver modelo recomendado disponível, o campo aparece na revisão.
- **FR-005**: Agentes criados pelo formulário anterior (feature 003) MUST continuar funcionando e
  abrir no assistente com as instruções antigas preservadas como "instruções extras" e as regras de
  passagem no padrão (FR-006).

**Passagem para atendente humano**

- **FR-006**: Todo agente MUST ter a regra "transferir quando o lead pedir para falar com uma
  pessoa" sempre ligada; a interface a mostra ligada e travada, com explicação.
- **FR-007**: O administrador MUST poder ligar ou desligar as regras: não souber responder,
  intenção de compra ou pedido de proposta, palavras-chave definidas por ele (lista), e lead
  irritado. Cada regra tem uma frase explicando quando dispara.
- **FR-008**: Cada agente MUST ter uma mensagem de transferência enviada ao lead, obrigatória, com
  sugestão pronta e variáveis do contato; e uma mensagem opcional para fora do horário.
- **FR-009**: O administrador MUST poder definir o horário de atendimento humano (dias e faixas) e
  a mensagem de fora do horário; fora do horário a conversa é transferida do mesmo jeito, mudando
  apenas a mensagem enviada ao lead.
- **FR-010**: Toda transferência MUST registrar um motivo padronizado (lead pediu uma pessoa, agente
  não soube responder, intenção de compra, palavra-chave com a palavra, lead irritado, mídia não
  compreendida, falha do agente, agente desativado), a mensagem do lead que a causou e um resumo.
- **FR-011**: Palavras-chave MUST ser comparadas ignorando acentos e maiúsculas e por palavra
  inteira.

**Teste (simulação)**

- **FR-012**: O sistema MUST oferecer um chat de simulação com a configuração atual do agente,
  inclusive não salva, que nunca envia mensagens ao WhatsApp nem cria conversas, execuções ou
  métricas.
- **FR-013**: A simulação MUST destacar cada ponto em que uma regra de transferência dispararia,
  com o motivo, e permitir reiniciar.

**Atendimento direto**

- **FR-014**: Cada agente MUST ter o controle "Atender conversas novas" com alcance "todas" ou "só
  com as palavras"; ligá-lo faz o agente responder às conversas novas sem que o administrador monte
  um fluxo.
- **FR-015**: O atendimento direto MUST respeitar as mesmas regras de prioridade, exclusividade por
  conversa, modo humano e "não automatizar" dos fluxos da feature 003, e aparecer na área Fluxos
  como fluxo gerenciado pelo agente, sem edição no editor visual.
- **FR-016**: Desativar ou excluir um agente MUST desligar seu atendimento direto e transferir as
  conversas em andamento com ele para humano com o motivo "Agente desativado".

**Lado do atendente**

- **FR-017**: A lista de conversas MUST colocar conversas transferidas e não assumidas no topo, com
  o selo "Aguardando humano"; o menu lateral MUST mostrar a quantidade dessas conversas.
- **FR-018**: Ao abrir uma conversa transferida, o atendente MUST ver motivo, mensagem do lead
  citada, nome do agente, resumo e o botão "Assumir" em destaque; após assumir, os demais
  atendentes veem quem assumiu.
- **FR-019**: Atendentes MUST poder ligar ou desligar um aviso sonoro de nova transferência nas
  próprias preferências; padrão desligado.
- **FR-020**: Atendentes MUST poder devolver a conversa ao agente que a transferiu.

**Painel de agentes**

- **FR-021**: A área Agentes MUST mostrar um cartão por agente com situação (atendendo, pausado,
  provedor com problema), conversas atendidas hoje e em 7 dias, concluídas sem humano,
  transferidas e os três motivos mais frequentes, com atalho para as conversas transferidas.

**Acesso**

- **FR-022**: Apenas administradores criam, editam, testam e ligam o atendimento de agentes;
  atendentes assumem, devolvem e configuram o próprio aviso sonoro.

### Key Entities

- **Agente de IA** (estende a feature 003): nome, objetivo, tom de voz, informações da empresa,
  instruções extras, instruções geradas, provedor, modelo, regras de passagem, mensagem de
  transferência, mensagem fora do horário, horário de atendimento, atendimento direto (ligado,
  alcance, palavras), ativo/inativo.
- **Regra de passagem**: tipo (lead pediu pessoa, não soube responder, intenção de compra,
  palavra-chave, lead irritado), ligada/desligada, parâmetros (lista de palavras).
- **Transferência** (estende o modo de atendimento da feature 003): motivo padronizado, mensagem
  do lead citada, agente responsável, resumo, momento, quem assumiu.
- **Simulação**: sessão temporária de teste de um agente por um administrador; não persiste.
- **Preferência do atendente**: aviso sonoro de transferência ligado/desligado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um administrador sem treinamento cria um agente com regras de passagem e o coloca
  para atender em menos de 5 minutos, sem escrever instruções em prosa.
- **SC-002**: Em testes com 30 formas diferentes de pedir uma pessoa em português (ex.: "quero
  falar com alguém", "me passa pra um atendente", "tem alguém aí?"), o agente transfere em pelo
  menos 95% dos casos e nunca transfere em pedidos claramente sem relação.
- **SC-003**: 100% das transferências chegam ao painel com motivo padronizado e mensagem do lead
  citada.
- **SC-004**: Um atendente percebe uma nova transferência em até 3 segundos e assume em um clique.
- **SC-005**: 90% dos administradores testam o agente na simulação antes de ligar o atendimento
  (medido pela ordem das ações nas primeiras 4 semanas).
- **SC-006**: Nenhuma mensagem de simulação chega ao WhatsApp ou aparece no painel de chat.
- **SC-007**: A taxa de transferências por "agente não soube responder" cai pelo menos 30% após o
  administrador ajustar as informações da empresa com base no painel de agentes.

## Assumptions

- Depende das features 001 (chat, conexão, papéis) e 003 (provedores, agentes, modo de
  atendimento, execução de fluxos); os provedores continuam OpenAI, Anthropic e Google Gemini.
- As regras de passagem de intenção ("lead pediu uma pessoa", "intenção de compra", "lead
  irritado", "não soube responder") são interpretadas pelo próprio agente de IA a partir das
  instruções geradas; a regra de palavras-chave é verificada pelo sistema antes de a mensagem
  chegar ao agente, para ser determinística.
- "Modelo recomendado" é uma escolha fixa por provedor mantida pelo produto (o modelo de melhor
  custo-benefício para conversas curtas), atualizável sem mudar os agentes já criados.
- Transferir significa marcar a conversa como "aguardando humano" para toda a equipe; direcionar a
  um atendente ou equipe específica fica para uma versão futura.
- Horário de atendimento usa o fuso de Brasília; feriados ficam fora desta versão.
- A simulação usa o provedor real do agente e consome a cota da empresa nele; isso é aceito.
- O atendimento direto (FR-014) reaproveita o mecanismo de fluxos da feature 003 ("mensagem
  recebida" → agente → transferir) para herdar prioridade, exclusividade e histórico; o
  administrador não vê nem edita esse fluxo.
- Áudios do lead não são transcritos nesta versão.
- Interface em português do Brasil, desktop primeiro; o assistente e a simulação funcionam também
  em celular, com o painel de agentes em uma coluna.
- Interface em conformidade com a identidade V4 e as regras de contraste já em vigor.
