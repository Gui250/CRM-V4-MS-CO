# Feature Specification: Painel de Chat do WhatsApp

**Feature Branch**: `001-whatsapp-chat-panel`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "painel de chat do WhatsApp via Evolution API, siga a identidade visual do logo da v4 para produzir o frontend o nome é V4 Company MS&CO"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver conversas e responder em tempo real (Priority: P1)

O atendente entra no CRM **V4 Company MS&CO**, abre o painel de chat e vê a lista de conversas do
WhatsApp da empresa, ordenadas pela mensagem mais recente, com nome/número do contato, prévia da
última mensagem, horário e contador de não lidas. Ao selecionar uma conversa, vê o histórico de
mensagens no layout familiar do WhatsApp (balões enviados à direita, recebidos à esquerda) e pode
responder com texto. Novas mensagens recebidas aparecem sem recarregar a página.

**Why this priority**: é o núcleo do painel; sem ler e responder mensagens, nada mais tem valor.

**Independent Test**: conectar um número de WhatsApp de teste, enviar uma mensagem de um celular
externo, verificar que ela aparece no painel e que a resposta enviada pelo painel chega ao celular.

**Acceptance Scenarios**:

1. **Given** o número de WhatsApp está conectado e existem conversas, **When** o atendente abre o
   painel, **Then** vê a lista de conversas ordenada da mais recente para a mais antiga.
2. **Given** uma conversa está aberta, **When** o contato envia uma nova mensagem, **Then** ela
   aparece no histórico em até 3 segundos sem recarregar a página.
3. **Given** uma conversa está aberta, **When** o atendente digita um texto e envia, **Then** a
   mensagem aparece no histórico com status (enviando → enviada → entregue → lida) e chega ao
   contato.
4. **Given** uma conversa fechada recebe mensagem, **When** o atendente olha a lista, **Then** a
   conversa sobe para o topo com contador de não lidas incrementado.
5. **Given** o envio de uma mensagem falha, **When** o erro ocorre, **Then** o balão é marcado
   como falho e o atendente pode reenviar.

---

### User Story 2 - Conectar o número de WhatsApp (Priority: P1)

Um administrador conecta o número de WhatsApp da empresa ao CRM lendo um QR Code exibido no painel,
vê o status da conexão (conectado, desconectado, aguardando leitura) e pode desconectar ou
reconectar o número.

**Why this priority**: pré-requisito para a história 1; sem conexão não há conversas.

**Independent Test**: em um CRM sem número conectado, gerar o QR Code, ler com o celular e ver o
status mudar para "conectado".

**Acceptance Scenarios**:

1. **Given** nenhum número conectado, **When** o administrador inicia a conexão, **Then** um QR
   Code é exibido e renovado automaticamente enquanto não for lido.
2. **Given** o QR Code foi lido, **When** a conexão é estabelecida, **Then** o status passa para
   "conectado" e as conversas começam a aparecer.
3. **Given** o número cai (celular offline, sessão encerrada), **When** isso ocorre, **Then** o
   painel exibe um aviso visível de desconexão para todos os atendentes.

---

### User Story 3 - Encontrar conversas e ver mídias (Priority: P2)

O atendente busca conversas por nome ou número, filtra por não lidas e visualiza mensagens de
mídia recebidas (imagens, áudios, vídeos, documentos) dentro da conversa, além de enviar imagens e
documentos.

**Why this priority**: aumenta a produtividade, mas o painel já entrega valor só com texto.

**Independent Test**: com várias conversas, buscar por parte de um nome e confirmar o resultado;
receber uma imagem e um áudio e reproduzi-los no painel.

**Acceptance Scenarios**:

1. **Given** existem conversas, **When** o atendente digita parte de um nome ou número na busca,
   **Then** a lista mostra apenas as conversas correspondentes.
2. **Given** o contato envia imagem, áudio, vídeo ou documento, **When** a conversa é aberta,
   **Then** a mídia é exibida (imagem com prévia, áudio/vídeo reproduzível, documento baixável).
3. **Given** uma conversa aberta, **When** o atendente anexa uma imagem ou documento e envia,
   **Then** o arquivo chega ao contato.

---

### User Story 4 - Identidade visual V4 Company MS&CO (Priority: P2)

Todo o painel exibe a marca **V4 Company MS&CO**: logo da V4 no cabeçalho/menu, paleta baseada no
vermelho e branco do logo, tipografia forte e sem serifa, e formas geométricas retas coerentes com
o logo.

**Why this priority**: reforça a marca e profissionalismo; não bloqueia o uso funcional.

**Independent Test**: revisão visual das telas de conexão e chat comparando com o logo em
`assets/`.

**Acceptance Scenarios**:

1. **Given** qualquer tela do painel, **When** carregada, **Then** o logo da V4 e o nome
   "V4 Company MS&CO" aparecem no cabeçalho ou menu lateral.
2. **Given** elementos de ação primária (enviar, conectar), **When** exibidos, **Then** usam o
   vermelho da marca com texto branco e contraste acessível (mínimo AA).

---

### User Story 5 - Cadastro, login e aprovação de usuários (Priority: P1)

Uma pessoa da equipe acessa o CRM, cria sua conta com nome, e-mail e senha e passa a entrar com
esses dados. O primeiro cadastro do sistema vira administrador automaticamente. Os cadastros
seguintes ficam aguardando aprovação: só depois que um administrador aprova a conta a pessoa
consegue entrar. O administrador também pode desativar e reativar contas e promover ou rebaixar
administradores.

**Why this priority**: todas as telas exigem login (FR-013), e as conversas contêm dados pessoais
de clientes; sem controle de acesso o painel não pode ir para produção.

**Independent Test**: cadastrar o primeiro usuário e entrar direto como administrador; cadastrar
um segundo, confirmar que ele não consegue entrar; aprovar pela tela Usuários e confirmar que agora
entra.

**Acceptance Scenarios**:

1. **Given** nenhum usuário cadastrado, **When** alguém se cadastra, **Then** a conta é criada
   como administrador ativo e a pessoa já entra no painel.
2. **Given** já existe um administrador, **When** outra pessoa se cadastra, **Then** a conta fica
   "aguardando aprovação" e ela vê uma mensagem explicando isso.
3. **Given** uma conta aguardando aprovação ou desativada, **When** a pessoa tenta entrar, **Then**
   o acesso é negado com mensagem específica para cada caso.
4. **Given** e-mail ou senha incorretos, **When** a pessoa tenta entrar, **Then** vê a mesma
   mensagem genérica, sem revelar se o e-mail existe.
5. **Given** um administrador na tela Usuários, **When** aprova, desativa ou reativa uma conta,
   **Then** a mudança vale imediatamente; uma conta desativada perde o acesso, inclusive a
   telas já abertas, em até 30 segundos.
6. **Given** só existe um administrador ativo, **When** alguém tenta desativá-lo ou rebaixá-lo,
   **Then** a ação é bloqueada com mensagem explicando o motivo.
7. **Given** um usuário logado, **When** clica em "Sair", **Then** a sessão é encerrada e ele volta
   à tela de login.

---

### Edge Cases

- Conversa com milhares de mensagens: histórico carrega as mais recentes primeiro e busca as
  antigas sob demanda ao rolar para cima.
- Mensagem recebida enquanto o número está desconectado: é sincronizada quando a conexão volta.
- Dois atendentes respondendo a mesma conversa ao mesmo tempo: ambos veem as mensagens um do
  outro em tempo real, identificadas pelo atendente que enviou.
- Mensagens de grupos do WhatsApp: ignoradas nesta versão (fora de escopo).
- Tipos de mensagem não suportados (figurinhas, localização, contatos, enquetes): exibidos como
  balão informativo "tipo de mensagem não suportado" em vez de sumir.
- Mensagens enviadas pelo celular do próprio número: aparecem no painel como enviadas.
- Anexo acima do limite de tamanho do WhatsApp: bloqueado antes do envio com mensagem clara.
- Perda de conexão com a internet do atendente: aviso na tela e o texto que estava sendo
  digitado não é perdido; ao voltar, o painel recarrega o que chegou nesse intervalo.
- Cadastro com e-mail já existente: bloqueado com mensagem "E-mail já cadastrado".
- Muitas tentativas de login ou cadastro em sequência: bloqueadas temporariamente.
- Sessão parada por mais de 7 dias: expira e o usuário precisa entrar de novo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um administrador conecte um número de WhatsApp via
  leitura de QR Code, e desconecte/reconecte o número.
- **FR-002**: O sistema MUST exibir o status da conexão do número em tempo real para todos os
  usuários do painel.
- **FR-003**: O sistema MUST suportar exatamente um número de WhatsApp conectado por vez nesta
  versão; múltiplos números ficam para versão futura.
- **FR-004**: O sistema MUST listar as conversas individuais ordenadas pela última mensagem, com
  nome ou número do contato, foto (quando disponível), prévia da última mensagem, horário e
  contador de não lidas.
- **FR-005**: O sistema MUST exibir o histórico de uma conversa com paginação ao rolar, em layout
  de balões similar ao WhatsApp, com data/hora e status de entrega das mensagens enviadas.
- **FR-006**: O sistema MUST receber novas mensagens e atualizações de status sem recarregar a
  página.
- **FR-007**: Usuários MUST poder enviar mensagens de texto e reenviar mensagens que falharam.
- **FR-008**: Usuários MUST poder enviar imagens e documentos, e visualizar/reproduzir imagens,
  áudios, vídeos e documentos recebidos.
- **FR-009**: O sistema MUST marcar a conversa como lida ao ser aberta no painel e zerar o
  contador de não lidas.
- **FR-010**: Usuários MUST poder buscar conversas por nome ou número e filtrar por não lidas.
- **FR-011**: O sistema MUST registrar qual usuário do CRM enviou cada mensagem e exibir essa
  identificação para os demais atendentes.
- **FR-012**: O sistema MUST persistir contatos, conversas e mensagens no CRM, para que o histórico
  continue disponível mesmo se o número for desconectado.
- **FR-013**: O acesso ao painel MUST exigir login no CRM; todo atendente logado vê e pode
  responder todas as conversas. Apenas administradores conectam/desconectam o número.
- **FR-014**: O sistema MUST ignorar mensagens de grupos e exibir tipos de mensagem não suportados
  como aviso informativo.
- **FR-015**: A interface MUST seguir a identidade visual da V4 (logo, vermelho e branco,
  tipografia forte sem serifa) e exibir o nome "V4 Company MS&CO".
- **FR-016**: A interface MUST ser utilizável em desktop e tablet; em telas pequenas a lista de
  conversas e a conversa aberta são exibidas uma de cada vez.
- **FR-017**: Pessoas MUST poder se cadastrar com nome (2–100 caracteres), e-mail único e senha de
  no mínimo 8 caracteres, e entrar com e-mail e senha.
- **FR-018**: O primeiro usuário cadastrado MUST virar administrador ativo; os demais MUST ficar
  aguardando aprovação e não conseguir entrar até serem aprovados por um administrador.
- **FR-019**: Administradores MUST poder aprovar, desativar e reativar contas e alterar o papel
  entre administrador e atendente; desativar uma conta encerra suas sessões imediatamente.
- **FR-020**: O sistema MUST impedir que o último administrador ativo seja desativado ou
  rebaixado, e que um administrador desative a própria conta.
- **FR-021**: Falhas de login MUST exibir mensagem genérica que não revele se o e-mail existe;
  contas aguardando aprovação ou desativadas recebem mensagem específica.
- **FR-022**: O sistema MUST limitar tentativas repetidas de login e cadastro e encerrar sessões
  após 7 dias sem uso ou quando o usuário sair.

### Key Entities

- **Conexão de WhatsApp**: número de WhatsApp vinculado ao CRM; status (conectado, desconectado,
  aguardando QR), data da última conexão.
- **Contato**: pessoa no WhatsApp; número, nome de exibição, foto. Base para o lead no CRM.
- **Conversa**: diálogo entre a conexão e um contato; última mensagem, horário, não lidas.
- **Mensagem**: item de uma conversa; direção (recebida/enviada), tipo (texto, imagem, áudio,
  vídeo, documento, não suportado), conteúdo ou mídia, horário, status de entrega, usuário do CRM
  que enviou (se enviada pelo painel).
- **Usuário do CRM**: pessoa que acessa o painel; nome, e-mail, papel (administrador ou
  atendente) e situação (aguardando aprovação, ativo, desativado).
- **Sessão**: acesso logado de um usuário; expira após 7 dias sem uso ou ao sair.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Mensagens recebidas aparecem no painel em até 3 segundos em 95% dos casos.
- **SC-002**: Um administrador conecta o número de WhatsApp em menos de 2 minutos, sem ajuda.
- **SC-003**: Um atendente encontra uma conversa pela busca e responde em menos de 15 segundos.
- **SC-004**: A lista de conversas abre em menos de 2 segundos com até 5.000 conversas.
- **SC-005**: 99% das mensagens de texto enviadas pelo painel chegam ao contato.
- **SC-006**: 90% dos atendentes conseguem responder uma conversa na primeira tentativa, sem
  treinamento, por conta do layout familiar ao WhatsApp.
- **SC-007**: Todas as telas passam em revisão de marca (logo, cores, nome) e contraste AA.
- **SC-008**: Uma pessoa nova se cadastra em menos de 1 minuto e um administrador aprova a conta em
  menos de 30 segundos a partir da tela Usuários.

## Assumptions

- A integração com o WhatsApp é feita pela Evolution API, operada pela empresa; a disponibilidade
  da conexão depende dela e do celular vinculado.
- Apenas conversas individuais estão no escopo; grupos, chamadas de voz/vídeo, status e
  transmissões ficam fora.
- Um único número de WhatsApp por instalação; atribuição de conversas a atendentes fica fora.
- Envio de áudio gravado pelo painel, templates/mensagens rápidas, etiquetas e transferência de
  conversa ficam para versões futuras.
- Disparo de fluxos de automação e agentes de IA a partir do chat são features separadas do PRD.
- Login e cadastro são próprios do CRM (sem login social nem SSO nesta versão); recuperação de
  senha por e-mail fica para versão futura.
- Mensagens anteriores à conexão do número não são importadas nesta versão; o painel começa a
  registrar a partir da conexão. Mensagens recebidas com o número desconectado chegam quando a
  conexão volta, entregues normalmente pelo WhatsApp.
- Interface em português do Brasil.
- Identidade visual derivada do logo em `assets/images.jpeg`: vermelho vivo (~#E30613) com
  branco, formas geométricas retas.
