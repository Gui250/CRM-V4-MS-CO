# Feature Specification: Funis e Pipelines de Leads

**Feature Branch**: `002-sales-pipelines`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "criação de funis e montagem de pipelines com drag and drop; contatos do WhatsApp viram leads que se movem entre etapas"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mover leads entre etapas no quadro do funil (Priority: P1)

O atendente abre **Funis** no CRM, escolhe um funil (ex.: "Vendas") e vê o pipeline como um quadro
de colunas, uma por etapa ("Novo", "Qualificado", "Proposta", "Ganho", "Perdido"). Cada lead é um
cartão com nome e número do contato, valor estimado, responsável e há quanto tempo está na etapa.
O atendente arrasta o cartão de uma coluna para outra para avançar o lead; a mudança fica salva e
aparece para os outros atendentes sem recarregar a página.

**Why this priority**: é o coração da feature; sem o quadro e o arrastar, funis são só cadastro.

**Independent Test**: com um funil e alguns leads já existentes, arrastar um cartão de "Novo" para
"Qualificado", recarregar a página e ver que ele continua em "Qualificado"; numa segunda sessão
aberta, ver o cartão mudar de coluna sozinho.

**Acceptance Scenarios**:

1. **Given** um funil com leads, **When** o atendente abre o funil, **Then** vê uma coluna por
   etapa, na ordem configurada, com os cartões de cada etapa, a quantidade de leads e a soma dos
   valores estimados da coluna.
2. **Given** o quadro aberto, **When** o atendente arrasta um cartão para outra etapa e solta,
   **Then** o cartão fica na nova etapa, a contagem e a soma das duas colunas se atualizam e a
   mudança persiste ao recarregar.
3. **Given** dois atendentes com o mesmo funil aberto, **When** um move um cartão, **Then** o outro
   vê o cartão na nova coluna em até 3 segundos, sem recarregar.
4. **Given** o atendente arrasta um cartão para uma etapa final de perda, **When** solta, **Then** o
   sistema pede o motivo da perda antes de concluir; cancelar devolve o cartão à etapa original.
5. **Given** um usuário que não usa mouse, **When** foca um cartão, **Then** consegue movê-lo para
   outra etapa pelo teclado ou por um menu "Mover para".
6. **Given** uma coluna com muitos leads, **When** o atendente rola a coluna, **Then** os cartões
   seguintes carregam sob demanda, e os cartões podem ser reordenados dentro da mesma coluna.

---

### User Story 2 - Transformar contatos do WhatsApp em leads (Priority: P1)

Uma conversa nova do WhatsApp vira lead automaticamente no funil de entrada. No painel de chat, o
atendente vê em qual funil e etapa o contato está e pode mudar a etapa ali mesmo, sem sair da
conversa; se o contato ainda não é lead, cria o lead com um clique, escolhendo funil e etapa. Do cartão no quadro, o atendente abre a
conversa do WhatsApp daquele lead.

**Why this priority**: é o que liga o chat já existente ao funil; sem isso os leads precisariam ser
digitados à mão e o funil não refletiria o atendimento real.

**Independent Test**: enviar uma mensagem de um celular que nunca falou com a empresa e ver o lead
surgir no funil conforme a regra de entrada; abrir a conversa, mudar a etapa pelo chat e ver o
cartão mudar de coluna no quadro.

**Acceptance Scenarios**:

1. **Given** um contato novo manda a primeira mensagem, **When** a mensagem chega, **Then** o lead
   é criado automaticamente na primeira etapa do funil marcado como "funil de entrada"; se nenhum
   funil estiver marcado, nenhum lead é criado sozinho e o atendente pode criá-lo pelo chat.
2. **Given** uma conversa aberta de um contato que já é lead, **When** o atendente olha o cabeçalho
   da conversa, **Then** vê o funil, a etapa atual e o responsável, e pode trocar a etapa ali.
3. **Given** uma conversa de um contato que ainda não é lead no funil escolhido, **When** o atendente
   usa "Criar lead" e escolhe funil e etapa, **Then** o lead aparece no quadro daquele funil.
4. **Given** um cartão no quadro, **When** o atendente usa "Abrir conversa", **Then** o painel de chat
   abre na conversa daquele contato.
5. **Given** um lead existente, **When** chega nova mensagem do contato, **Then** o cartão mostra
   indicação de mensagem não lida, sem mudar de etapa sozinho.

---

### User Story 3 - Criar funis e montar as etapas do pipeline (Priority: P1)

Um administrador cria funis diferentes para processos diferentes (ex.: "Vendas", "Pós-venda",
"Recrutamento"). Para cada funil, monta o pipeline: adiciona, renomeia e remove etapas, define a cor
de cada uma, marca quais etapas são finais de ganho ou de perda e reordena as etapas arrastando.
Ao criar um funil, ele já vem com etapas sugeridas que podem ser editadas.

**Why this priority**: sem funis e etapas configuráveis não há quadro para mover leads; o sistema
entrega um funil padrão para as histórias 1 e 2 funcionarem, mas cada empresa precisa do seu.

**Independent Test**: criar o funil "Pós-venda", adicionar a etapa "Onboarding", arrastá-la para a
segunda posição, marcar "Cancelado" como etapa de perda e ver o quadro refletir exatamente essa
ordem e essas etapas.

**Acceptance Scenarios**:

1. **Given** um administrador, **When** cria um funil com nome único, **Then** o funil aparece na lista com as etapas sugeridas "Novo", "Em contato", "Proposta",
   "Ganho" e "Perdido".
2. **Given** a tela de montagem de um funil, **When** o usuário arrasta uma etapa para outra posição,
   **Then** a nova ordem é salva e o quadro do funil passa a exibir as colunas nessa ordem.
3. **Given** uma etapa sem leads, **When** o usuário a exclui, **Then** ela some do funil.
4. **Given** uma etapa com leads, **When** o usuário tenta excluí-la, **Then** o sistema exige
   escolher outra etapa do mesmo funil para onde os leads serão movidos antes de excluir.
5. **Given** um funil com leads, **When** o usuário o arquiva, **Then** ele some da lista de funis
   ativos, os leads deixam de aparecer nos quadros e o funil pode ser reativado com tudo preservado.
6. **Given** um usuário sem permissão de gerenciar funis, **When** abre um funil, **Then** vê e move
   leads, mas não vê as opções de criar, editar, reordenar ou excluir funis e etapas. Só
   administradores gerenciam funis e etapas.
7. **Given** um administrador, **When** marca um funil como "funil de entrada", **Then** esse passa a
   ser o único funil de entrada (o anterior deixa de ser) e novos contatos entram na primeira etapa
   dele; desmarcar desliga a entrada automática.

---

### User Story 4 - Detalhes, responsável e histórico do lead (Priority: P2)

Ao abrir um cartão, o atendente vê e edita os dados do lead: título, valor estimado, responsável
(um usuário do CRM) e anotações. Vê também o histórico de etapas do lead: por quais etapas passou,
quando e quem moveu. Pode filtrar o quadro por responsável ("Meus leads") e buscar leads por nome ou
número do contato.

**Why this priority**: torna o funil gerenciável no dia a dia e registra os dados que os relatórios
(feature futura) vão usar, mas o quadro já entrega valor sem isso.

**Independent Test**: abrir um lead, definir valor R$ 5.000 e responsável "Bia", mover o lead duas
vezes e conferir no histórico as duas mudanças com autor e horário; filtrar "Meus leads" logado como
Bia e ver só os leads dela.

**Acceptance Scenarios**:

1. **Given** um lead aberto, **When** o atendente edita valor, responsável ou anotações e salva,
   **Then** o cartão no quadro reflete os novos dados para todos.
2. **Given** um lead que já mudou de etapa, **When** o atendente abre o histórico, **Then** vê cada
   mudança com etapa de origem, etapa de destino, usuário e data/hora, da mais recente para a mais
   antiga.
3. **Given** o quadro aberto, **When** o atendente filtra "Meus leads" ou busca por nome/número,
   **Then** só os cartões correspondentes aparecem, mantendo as colunas.
4. **Given** um lead marcado como perdido, **When** o atendente abre o lead, **Then** vê o motivo da
   perda e pode reabri-lo movendo-o para uma etapa não final.

---

### Edge Cases

- Dois atendentes movem o mesmo cartão ao mesmo tempo para etapas diferentes: vale a última mudança
  salva; os dois quadros convergem para ela e o histórico registra as duas.
- Falha ao salvar o movimento (ex.: sem internet): o cartão volta para a etapa original e o
  atendente vê uma mensagem de que o movimento não foi salvo.
- Etapa ou funil excluído/arquivado por um administrador enquanto um atendente está com o quadro
  aberto: o quadro se atualiza e um movimento para a etapa removida é recusado com mensagem clara.
- Funil com uma única etapa: permitido; um funil nunca fica com zero etapas.
- Nome de funil repetido: bloqueado com mensagem "Já existe um funil com esse nome".
- Contato sem nome no WhatsApp: o cartão mostra o número formatado.
- Mensagens de grupos: nunca geram leads (grupos já são ignorados pelo chat).
- Lead de contato cujo número deixou de conversar: o lead permanece; só é removido por ação humana.
- Tela pequena (celular): o quadro rola horizontalmente entre colunas e o movimento é feito pelo
  menu "Mover para", já que arrastar em telas pequenas é impreciso.
- Funil com milhares de leads: cada coluna carrega os cartões mais recentes primeiro e o restante
  sob demanda; contagens e somas das colunas refletem todos os leads, não só os carregados.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Administradores MUST poder criar, renomear, arquivar e reativar funis; nomes de
  funil são únicos entre funis ativos (1–60 caracteres).
- **FR-002**: Todo funil novo MUST ser criado com as etapas sugeridas "Novo", "Em contato",
  "Proposta", "Ganho" (final de ganho) e "Perdido" (final de perda), editáveis.
- **FR-003**: Administradores MUST poder adicionar, renomear (1–40 caracteres), colorir,
  excluir e reordenar por arrastar e soltar as etapas de um funil, e marcar etapas como final de
  ganho ou final de perda. Um funil MUST ter ao menos uma etapa.
- **FR-004**: Excluir uma etapa com leads MUST exigir a escolha de uma etapa de destino no mesmo
  funil; os leads são movidos e o movimento entra no histórico de cada lead.
- **FR-005**: O sistema MUST exibir cada funil como um quadro com uma coluna por etapa, na ordem
  configurada, mostrando em cada coluna a quantidade de leads e a soma dos valores estimados.
- **FR-006**: Usuários MUST poder mover um lead entre etapas arrastando o cartão, e reordenar
  cartões dentro da mesma etapa; a posição persiste.
- **FR-007**: Todo movimento MUST ter alternativa sem arrastar (teclado e menu "Mover para"),
  disponível também em telas pequenas.
- **FR-008**: Mover um lead para uma etapa final de perda MUST exigir um motivo (1–200 caracteres);
  cancelar devolve o lead à etapa anterior.
- **FR-009**: Mudanças em funis, etapas e leads MUST aparecer para os demais usuários com o quadro
  aberto sem recarregar a página.
- **FR-010**: Um lead MUST estar sempre ligado a um contato do WhatsApp; o cartão exibe nome (ou
  número formatado), valor estimado, responsável, tempo na etapa atual e indicador de mensagens não
  lidas da conversa.
- **FR-011**: A primeira mensagem recebida de um contato novo MUST criar um lead na primeira etapa
  do "funil de entrada", se houver um; no máximo um funil ativo é o funil de entrada, e só
  administradores o definem. Usuários também MUST poder criar leads manualmente pelo chat.
  Mensagens de grupo e mensagens enviadas pela própria empresa nunca geram leads.
- **FR-012**: O painel de chat MUST exibir, na conversa aberta, o funil, a etapa e o responsável do
  lead do contato, permitir trocar a etapa e permitir criar o lead quando ainda não existir.
- **FR-013**: Do cartão do lead, usuários MUST poder abrir a conversa correspondente no painel de
  chat.
- **FR-014**: Um contato MUST poder ter leads em vários funis ao mesmo tempo, mas no máximo um lead
  por funil; criar um segundo lead do mesmo contato no mesmo funil MUST ser bloqueado e levar ao
  lead existente. No chat, com leads em vários funis, todos são listados com sua etapa.
- **FR-015**: Usuários MUST poder editar título, valor estimado (em reais, ≥ 0), responsável
  (usuário ativo do CRM ou nenhum) e anotações (até 5.000 caracteres) de um lead.
- **FR-016**: O sistema MUST registrar cada mudança de etapa do lead com etapa de origem, etapa de
  destino, usuário (ou "automático") e data/hora, e exibir esse histórico no lead.
- **FR-017**: Usuários MUST poder filtrar o quadro por responsável (incluindo "Meus leads" e "Sem
  responsável") e buscar leads por nome ou número do contato.
- **FR-018**: Usuários MUST poder excluir um lead; a conversa e o contato do WhatsApp não são
  afetados. Arquivar um funil MUST preservar seus leads e histórico.
- **FR-019**: Todo usuário ativo MUST poder ver todos os funis ativos e mover leads em qualquer um
  deles (mesma regra "todos veem tudo" do painel de chat); criar, editar, reordenar, arquivar e
  excluir funis e etapas, e definir o funil de entrada, MUST ser restrito a administradores.
- **FR-020**: As telas de funis MUST seguir a identidade visual V4 já aplicada ao CRM e passar em
  contraste AA, incluindo as cores escolhidas para as etapas.

### Key Entities

- **Funil**: processo de negócio (ex.: Vendas); nome único, situação (ativo/arquivado), se é o
  funil de entrada, ordem das etapas. Tem muitas etapas e muitos leads.
- **Etapa**: coluna do pipeline de um funil; nome, cor, posição, tipo (aberta, final de ganho,
  final de perda).
- **Lead**: oportunidade de um contato dentro de um funil; título, etapa atual, posição na coluna,
  valor estimado, responsável, anotações, motivo de perda, data de entrada na etapa atual.
- **Movimento do lead**: registro de uma mudança de etapa; lead, etapa de origem, etapa de destino,
  autor (usuário ou automático), data/hora.
- **Contato** (existente, da feature 001): pessoa do WhatsApp; base do lead.
- **Usuário do CRM** (existente): autor dos movimentos e responsável pelos leads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um atendente move um lead para outra etapa em menos de 3 segundos a partir do quadro
  aberto, e o movimento aparece para os outros usuários em até 3 segundos em 95% dos casos.
- **SC-002**: Um administrador cria um funil novo com 5 etapas personalizadas, na ordem desejada, em
  menos de 2 minutos, sem ajuda.
- **SC-003**: O quadro de um funil com até 2.000 leads abre em menos de 2 segundos.
- **SC-004**: 100% dos contatos que entram pela regra de entrada aparecem no funil em até 5 segundos
  após a primeira mensagem, sem duplicar lead do mesmo contato no mesmo funil.
- **SC-005**: Do chat, o atendente vê a etapa do contato e a altera em menos de 5 segundos, sem sair
  da conversa.
- **SC-006**: 100% das mudanças de etapa ficam registradas no histórico com autor e horário.
- **SC-007**: 90% dos atendentes movem um lead entre etapas na primeira tentativa, sem instrução.
- **SC-008**: Todas as telas de funis passam em revisão de marca e contraste AA, e todas as ações de
  arrastar têm alternativa acessível por teclado.

## Assumptions

- Reaproveita o login, os usuários, os papéis (administrador e atendente), os contatos e o painel
  de chat da feature 001; nenhuma nova forma de acesso é criada.
- Leads vêm apenas de contatos do WhatsApp nesta versão; cadastro manual de leads sem conversa,
  importação por planilha e leads de outros canais (site, formulários) ficam para versões futuras.
- Campos personalizados por funil, produtos/itens do negócio, tarefas e lembretes de follow-up e
  metas de funil ficam para versões futuras.
- Automação de movimento (mover lead sozinho por regra ou por agente de IA) pertence à feature de
  fluxos de automação; esta feature só registra movimentos humanos e a entrada automática de leads,
  se escolhida.
- Relatórios e dashboards de conversão do funil pertencem à feature de relatórios; esta feature
  guarda o histórico de movimentos que eles vão consumir.
- Valores estimados são em reais (BRL), sem múltiplas moedas.
- Após a criação da feature, um funil "Vendas" com as etapas sugeridas existe por padrão, marcado
  como funil de entrada, para que o quadro funcione desde o primeiro acesso.
- Contatos que já conversavam antes desta feature não viram leads sozinhos; o atendente os cria
  pelo chat quando quiser.
- Interface em português do Brasil.
