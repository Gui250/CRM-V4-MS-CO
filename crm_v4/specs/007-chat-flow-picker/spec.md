# Feature Specification: Disparo de Fluxos pelo Painel da Conversa

**Feature Branch**: `007-chat-flow-picker`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "O fluxo de automação so pode ser disparado no para iniciar conversa, a partir de agora quero que o fluxo de automação tenha um icone no painel de conversa do whatsapp para escolher os fluxos"

## Contexto

Hoje o atendente só consegue, na prática, disparar um fluxo de automação ao **iniciar uma conversa
nova** (formulário "Nova conversa com automação", feature 003, história 4). Dentro de uma conversa
já aberta existe um botão de texto "Automações" no cabeçalho, mas ele fica desabilitado sempre que o
WhatsApp não está conectado, não explica por quê, e não é percebido como o lugar de disparar
fluxos. Esta feature substitui esse botão por um **ícone de automação no painel da conversa**, ao
lado dos controles de envio, que abre um seletor de fluxos claro, sempre visível e com estado
explicado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Escolher e disparar um fluxo numa conversa aberta (Priority: P1)

O atendente está numa conversa do WhatsApp e quer rodar um fluxo de abordagem (ex.: "follow-up de
proposta", "reativação") naquele contato. Ele clica no ícone de automação junto à caixa de
mensagem, vê a lista de fluxos ativos com nome e descrição, escolhe um, confirma, e o fluxo começa
naquela conversa. As mensagens que o fluxo envia aparecem no chat identificadas como automação.

**Why this priority**: é o pedido central. Sem isso o disparo por conversa continua escondido e o
atendente só consegue automatizar contatos novos.

**Independent Test**: com ao menos um fluxo ativo e o WhatsApp conectado, abrir uma conversa
existente, clicar no ícone, escolher o fluxo, confirmar, e verificar que a mensagem do fluxo chega
ao celular do contato e aparece no painel identificada como automação.

**Acceptance Scenarios**:

1. **Given** uma conversa aberta, **When** o atendente olha a área de envio de mensagem, **Then**
   vê um ícone de automação com rótulo acessível "Disparar fluxo", na mesma linha do anexo e do
   botão de enviar, em desktop e em celular.
2. **Given** fluxos ativos, **When** o atendente clica no ícone, **Then** abre um seletor listando
   apenas fluxos ativos, cada um com nome e descrição, ordenados por nome.
3. **Given** o seletor aberto, **When** o atendente escolhe um fluxo, **Then** vê um passo de
   confirmação com o nome do fluxo e o nome/telefone do contato antes de qualquer envio.
4. **Given** a confirmação, **When** o atendente confirma, **Then** o fluxo começa naquela conversa
   em até 2 segundos, o seletor fecha e a conversa passa a mostrar o indicador "automação em
   andamento" com opção de parar (comportamento já existente da feature 003).
5. **Given** muitos fluxos ativos (10 ou mais), **When** o seletor abre, **Then** mostra um campo de
   busca por nome que filtra a lista conforme o atendente digita.
6. **Given** nenhum fluxo ativo, **When** o atendente abre o seletor, **Then** vê a mensagem
   "Nenhum fluxo ativo" e, se for administrador, um atalho para a área de Automações.

---

### User Story 2 - Entender por que não dá para disparar agora (Priority: P2)

O atendente clica no ícone mas há algo que impede o disparo: o WhatsApp está desconectado, o
contato pediu para não receber automações, ou aquele fluxo já está rodando nessa conversa. Em vez
de um botão cinza sem explicação, ele vê o motivo em português claro e, quando existe, a ação
para resolver.

**Why this priority**: o botão desabilitado sem explicação é exatamente o que fez o disparo por
conversa parecer inexistente. Sem isso a história 1 continua "invisível" em metade das situações.

**Independent Test**: desconectar o WhatsApp, abrir uma conversa, clicar no ícone e confirmar que
o seletor abre mostrando o aviso de desconexão em vez de a lista; reconectar e confirmar que a
lista volta sem recarregar a página.

**Acceptance Scenarios**:

1. **Given** o WhatsApp desconectado, **When** o atendente clica no ícone, **Then** o ícone segue
   clicável e o seletor mostra "O WhatsApp está desconectado. Conecte o número para disparar
   automações." com link para a página de conexão, sem listar fluxos.
2. **Given** um contato marcado como "não automatizar", **When** o atendente abre o seletor,
   **Then** vê o aviso de que o contato pediu para não receber mensagens automáticas e a opção de
   desfazer a marcação (ação já existente da feature 003), e só depois disso a lista aparece.
3. **Given** uma automação já em andamento nessa conversa, **When** o atendente abre o seletor,
   **Then** vê qual fluxo está rodando e a opção "Parar" em vez da lista, porque uma conversa só
   pode ter uma automação por vez; ao parar, a lista aparece.
4. **Given** a confirmação de disparo, **When** o disparo falha por qualquer motivo, **Then** o
   seletor permanece aberto, mostra a mensagem de erro em português e permite tentar de novo ou
   cancelar.
5. **Given** o seletor aberto, **When** o atendente pressiona Esc, clica fora, ou navega para outra
   conversa, **Then** o seletor fecha sem disparar nada.

---

### User Story 3 - Um único lugar para disparar fluxos (Priority: P3)

Com o ícone no painel da conversa, o botão de texto "Automações" do cabeçalho deixa de existir,
para não haver dois pontos de entrada com comportamentos diferentes. O formulário "Nova conversa
com automação" continua sendo o caminho para números sem conversa no CRM.

**Why this priority**: evita confusão e manutenção dupla, mas não entrega valor novo por si só.

**Independent Test**: abrir uma conversa e confirmar que o cabeçalho não mostra mais "Automações";
abrir "Nova conversa" e confirmar que o disparo para número novo continua funcionando.

**Acceptance Scenarios**:

1. **Given** qualquer conversa aberta, **When** o atendente olha o cabeçalho, **Then** não há botão
   "Automações"; o único disparo de fluxo é o ícone junto à caixa de mensagem.
2. **Given** a tela "Nova conversa", **When** o atendente informa um número e escolhe um fluxo,
   **Then** o comportamento da feature 003 (história 4, cenário 4) permanece inalterado.

---

### Edge Cases

- O atendente abre o seletor e, enquanto ele está aberto, um administrador desativa o fluxo
  escolhido: ao confirmar, o sistema recusa com "Este fluxo não pode ser disparado" e a lista é
  atualizada.
- A lista de fluxos ainda está carregando quando o atendente clica no ícone: o seletor abre com
  indicador de carregamento, nunca com a lista vazia como se não houvesse fluxos.
- A conversa está em modo "humano" (o atendente assumiu): disparar um fluxo devolve a conversa ao
  modo automação, como já definido na feature 003; o passo de confirmação avisa isso.
- O atendente confirma duas vezes rápido (clique duplo): apenas uma execução é iniciada.
- Em telas estreitas o seletor ocupa a largura disponível e não sai da tela; a lista rola dentro
  do seletor.
- O ícone e o seletor funcionam por teclado: Tab alcança o ícone, Enter/Espaço abre, setas
  percorrem os fluxos, Enter escolhe, Esc fecha.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O painel de uma conversa aberta MUST exibir um ícone de automação junto aos controles
  de envio de mensagem (anexo e enviar), visível em desktop e celular, com rótulo acessível
  "Disparar fluxo" e dica ao passar o mouse.
- **FR-002**: O ícone MUST permanecer clicável em todos os estados; impedimentos (WhatsApp
  desconectado, contato que não quer automação, fluxo já em andamento) MUST ser explicados dentro
  do seletor, nunca por um botão desabilitado sem texto.
- **FR-003**: O seletor MUST listar somente fluxos ativos, com nome e descrição, ordenados por
  nome, e MUST refletir mudanças de status dos fluxos sem recarregar a página.
- **FR-004**: Com 10 ou mais fluxos ativos o seletor MUST oferecer busca por nome que filtra a
  lista enquanto o atendente digita.
- **FR-005**: Antes de disparar, o seletor MUST pedir confirmação mostrando o nome do fluxo e o
  contato de destino; quando a conversa estiver em modo humano, MUST avisar que ela voltará ao modo
  automação.
- **FR-006**: Ao confirmar, o sistema MUST iniciar o fluxo naquela conversa uma única vez, mesmo
  com cliques repetidos, e fechar o seletor em caso de sucesso.
- **FR-007**: Enquanto houver uma automação em andamento na conversa, o seletor MUST mostrar o
  nome do fluxo em execução e a ação "Parar" em vez da lista; só uma automação roda por conversa
  de cada vez.
- **FR-008**: Em caso de falha no disparo, o seletor MUST permanecer aberto mostrando a mensagem de
  erro em português e permitir nova tentativa.
- **FR-009**: Quando não houver fluxo ativo, o seletor MUST mostrar "Nenhum fluxo ativo" e, para
  administradores, um atalho para a área de Automações.
- **FR-010**: O seletor MUST fechar com Esc, clique fora ou troca de conversa, sem disparar nada.
- **FR-011**: O botão de texto "Automações" do cabeçalho da conversa MUST ser removido; o ícone
  passa a ser o único ponto de disparo dentro de uma conversa.
- **FR-012**: O fluxo "Nova conversa com automação" (número sem conversa) MUST continuar
  funcionando como definido na feature 003.
- **FR-013**: Todo disparo feito pelo ícone MUST ficar registrado no histórico de execuções com
  origem "manual" e o atendente que disparou, como já ocorre na feature 003.
- **FR-014**: O ícone e o seletor MUST ser operáveis por teclado e anunciados corretamente por
  leitores de tela (nome, estado aberto/fechado, itens de menu).

### Key Entities

Nenhuma entidade nova. A feature usa os conceitos já existentes da feature 003:

- **Fluxo**: automação criada pelo administrador; só os com status "ativo" aparecem no seletor.
- **Execução**: instância de um fluxo rodando numa conversa; o disparo pelo ícone cria uma execução
  de origem "manual".
- **Conversa**: conversa do WhatsApp onde o fluxo roda; carrega o modo (automação/humano) e a
  marcação "não automatizar" do contato.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um atendente que nunca usou a função encontra o ícone e dispara um fluxo numa
  conversa existente em menos de 30 segundos, sem instrução.
- **SC-002**: 100% das situações em que o disparo não é possível mostram um motivo em texto dentro
  do seletor; nenhum estado "botão cinza sem explicação" permanece.
- **SC-003**: Após confirmar, o indicador "automação em andamento" aparece na conversa em até 2
  segundos em 95% dos disparos.
- **SC-004**: Cliques repetidos na confirmação nunca geram mais de uma execução na conversa.
- **SC-005**: O ícone e o seletor passam nas verificações de contraste AA e são totalmente operáveis
  por teclado.
- **SC-006**: Nenhuma regressão no disparo por "Nova conversa com automação" nem no histórico de
  execuções (testes existentes da feature 003 continuam passando).

## Assumptions

- "Painel de conversa do WhatsApp" é a tela de chat do CRM com uma conversa aberta; o ícone fica
  na barra de envio (junto ao anexo), não no cabeçalho.
- "Escolher os fluxos" significa escolher entre todos os fluxos **ativos**, independentemente do
  tipo de gatilho (o sistema já permite disparar qualquer fluxo ativo por conversa). Se o
  administrador quiser esconder um fluxo do seletor, basta desativá-lo.
- Uma conversa tem no máximo uma automação ativa por vez (regra da feature 003). Para trocar de
  fluxo o atendente para o atual e dispara o novo.
- O passo de confirmação é mantido para evitar disparos acidentais, já que o fluxo envia mensagens
  ao cliente imediatamente.
- Disparo em massa (vários contatos de uma vez) continua fora de escopo, como na feature 003.
- Depende da feature 001 (painel de chat e conexão) e da feature 003 (fluxos, execuções,
  indicador de andamento, marcação "não automatizar").
