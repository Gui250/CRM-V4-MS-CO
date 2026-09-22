# Feature Specification: Tela de edição do fluxo de automação

**Feature Branch**: `005-fix-flow-editor-screen`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "A tela de criação de fluxos de automação não está redirecionando com sucesso e não está sendo exibida, veja e tente concertar o erro"

## Diagnóstico

Hoje, ao clicar em **Novo fluxo** na área Automações, o fluxo é criado com sucesso e o sistema
leva o administrador para a página do fluxo recém-criado. Essa página, porém, **não existe**: a
feature 003 (`specs/003-automation-flows-ai-agents/`) entregou a lista de fluxos, o painel de
configuração de blocos, os blocos visuais e o histórico de execuções, mas as tarefas do editor
visual e da sua página (T041 e T042 em `tasks.md`, além do restante de T039) ficaram pendentes.
O mesmo destino é usado pelo nome do fluxo na lista, portanto **nenhum fluxo pode ser aberto ou
editado** e o navegador mostra "página não encontrada".

Esta feature fecha essa lacuna: entregar a tela de edição para a qual a criação já redireciona.
O comportamento detalhado do editor continua definido pela User Story 1 da feature 003; aqui
ficam apenas os requisitos que tornam a tela alcançável, utilizável e resiliente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Criar um fluxo e cair na tela de edição (Priority: P1)

Um administrador digita o nome de um novo fluxo na área Automações, confirma e, imediatamente,
vê a tela de edição daquele fluxo: o nome no topo, a situação "Rascunho", uma área de trabalho
vazia e a paleta de blocos para começar a montar o fluxo.

**Why this priority**: é o bug reportado. Sem essa tela, criar um fluxo termina em "página não
encontrada" e toda a área de automações fica inutilizável.

**Independent Test**: criar um fluxo chamado "Boas-vindas" e confirmar que a tela de edição abre
com esse nome, sem erro, em até 2 segundos.

**Acceptance Scenarios**:

1. **Given** a lista de fluxos, **When** o administrador cria um fluxo com nome válido, **Then**
   é levado à tela de edição desse fluxo, que exibe o nome, a situação "Rascunho" e a área de
   trabalho vazia com a paleta de blocos.
2. **Given** a tela de edição recém-aberta, **When** o administrador clica em "← Automações",
   **Then** volta à lista e o fluxo criado aparece nela como "Rascunho".
3. **Given** a lista de fluxos, **When** o administrador clica no nome de um fluxo existente,
   **Then** a tela de edição abre com os blocos e ligações já salvos daquele fluxo.

---

### User Story 2 - Montar, salvar e ativar o fluxo na tela (Priority: P2)

Na tela de edição, o administrador adiciona blocos pela paleta, liga-os, configura cada bloco no
painel lateral, salva e ativa o fluxo. Problemas de ativação (sem gatilho, bloco desconectado,
campo obrigatório vazio) aparecem destacados nos blocos com a explicação.

**Why this priority**: é o propósito da tela; sem salvar e ativar, chegar até ela não gera valor.
Reaproveita integralmente as regras da User Story 1 da feature 003.

**Independent Test**: montar "gatilho mensagem recebida → esperar 5 segundos → enviar texto",
salvar, ativar e confirmar que a lista mostra o fluxo como "Ativo".

**Acceptance Scenarios**:

1. **Given** um fluxo em edição, **When** o administrador adiciona blocos, liga-os e salva,
   **Then** a tela confirma o salvamento e, ao reabrir a tela, os blocos e ligações persistem.
2. **Given** um fluxo salvo válido, **When** o administrador ativa, **Then** a situação passa a
   "Ativo" na tela e na lista.
3. **Given** um fluxo com gatilho faltando ou bloco desconectado, **When** o administrador tenta
   ativar, **Then** a ativação é recusada e os blocos com problema ficam destacados com a
   mensagem correspondente.
4. **Given** alterações não salvas, **When** o administrador tenta sair da tela, **Then** é
   avisado de que perderá as alterações e pode cancelar a saída.

---

### User Story 3 - Estados de erro e telas pequenas (Priority: P3)

A tela lida com fluxos inexistentes, com quem não é administrador e com telas estreitas sem
quebrar nem deixar o usuário sem saída.

**Why this priority**: evita repetir a classe de erro reportada (tela em branco / "página não
encontrada" sem explicação) nos casos de borda.

**Independent Test**: abrir o endereço de um fluxo que não existe e confirmar a mensagem
"Fluxo não encontrado" com link de volta à lista.

**Acceptance Scenarios**:

1. **Given** um endereço de fluxo que não existe ou foi excluído, **When** o administrador o
   abre, **Then** vê "Fluxo não encontrado" com link para a lista, não uma tela em branco.
2. **Given** um usuário que não é administrador, **When** abre a tela de edição, **Then** vê o
   aviso de acesso restrito já usado nas demais telas de automação.
3. **Given** uma tela com menos de 1024 px de largura, **When** o administrador abre um fluxo,
   **Then** vê os blocos em modo somente leitura com o aviso de que a edição exige desktop, e
   ainda pode ativar ou desativar o fluxo.

---

### Edge Cases

- Criação bem-sucedida mas a tela de edição demora a carregar: a tela mostra "Carregando…" e não
  exibe formulário vazio antes dos dados chegarem.
- Fluxo excluído por outro administrador enquanto a tela está aberta: salvar ou ativar mostra a
  mensagem de erro retornada e oferece voltar à lista.
- Fluxo ativo aberto na tela: editar e salvar cria uma nova versão sem afetar execuções em
  andamento (regra da feature 003), e a tela deixa claro que o fluxo continua ativo.
- Recarregar a página na tela de edição mantém o usuário na mesma tela com o fluxo carregado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Após criar um fluxo com sucesso, o sistema MUST levar o administrador à tela de
  edição desse fluxo, e essa tela MUST existir e carregar o fluxo pelo seu identificador.
- **FR-002**: O nome de cada fluxo na lista MUST abrir a mesma tela de edição.
- **FR-003**: A tela de edição MUST exibir nome, situação (Rascunho/Ativo/Inativo), área de
  trabalho com os blocos e ligações salvos, paleta de blocos e painel de configuração do bloco
  selecionado, conforme a User Story 1 da feature 003.
- **FR-004**: O administrador MUST poder salvar o fluxo pela tela e, ao reabri-la, encontrar
  exatamente o que salvou.
- **FR-005**: O administrador MUST poder ativar e desativar o fluxo pela tela; ao ativar um fluxo
  inválido, os blocos com problema MUST ser destacados com a explicação.
- **FR-006**: Ao sair da tela com alterações não salvas, o sistema MUST avisar e permitir
  cancelar a saída.
- **FR-007**: Um identificador de fluxo inexistente MUST resultar em "Fluxo não encontrado" com
  link para a lista; nunca em tela em branco ou erro genérico do navegador.
- **FR-008**: Usuários que não são administradores MUST ver o aviso de acesso restrito na tela.
- **FR-009**: Em telas com menos de 1024 px de largura, a tela MUST mostrar o fluxo somente
  leitura, com aviso, mantendo ativar/desativar disponíveis.
- **FR-010**: A tela MUST oferecer um caminho de volta à lista de fluxos e um atalho para o
  histórico de execuções do fluxo.

### Key Entities

- **Fluxo**: automação nomeada com situação (rascunho, ativo, inativo), gatilho e versão atual
  do desenho de blocos; já existe (feature 003).
- **Desenho do fluxo (grafo)**: blocos com configuração e posição e as ligações entre eles; é o
  que a tela edita e salva como nova versão.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das criações de fluxo bem-sucedidas terminam na tela de edição do fluxo
  criado, sem "página não encontrada".
- **SC-002**: A tela de edição fica visível com o fluxo carregado em até 2 segundos após a
  criação, em rede local.
- **SC-003**: Um administrador consegue criar, montar (3 blocos), salvar e ativar um fluxo pela
  primeira vez em menos de 5 minutos sem ajuda.
- **SC-004**: Nenhum endereço de fluxo (existente, inexistente ou excluído) resulta em tela em
  branco: todos mostram conteúdo ou uma mensagem em português com saída para a lista.

## Assumptions

- O comportamento do editor (paleta, ligações, validação na ativação, versões, teste do fluxo)
  é o já especificado na feature 003; esta feature não altera essas regras, só entrega a tela.
- Os pedaços já prontos da feature 003 (lista, blocos visuais, painel de configuração, conversão
  do desenho, destaque de problemas) são reaproveitados; nada deles precisa ser refeito.
- O botão "Testar" do editor (User Story 5 da feature 003) fica de fora desta correção e
  continua na feature 003.
- Apenas administradores acessam a tela, como nas demais telas de automação.
- Interface em português do Brasil, seguindo a identidade visual já definida.
