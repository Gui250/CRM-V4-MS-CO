# Research: Disparo de Fluxos pelo Painel da Conversa

Nenhum item ficou como NEEDS CLARIFICATION no Technical Context. As decisões abaixo resolvem as
escolhas de design levantadas pela spec, com base no código existente (features 001 e 003).

## 1. O que já existe e o que realmente falta

**Achado**: o backend já faz tudo que a spec pede.

| Necessidade da spec | Já existe (feature 003) |
|---|---|
| Listar fluxos ativos para atendentes | `GET /api/flows?status=active` (único filtro permitido a não-admin, `routes/flows.ts`) |
| Disparar numa conversa | `POST /api/conversations/{id}/start-flow` → `controllers/runs.ts#startManual` |
| Recusar fluxo inativo | `FLOW_NOT_STARTABLE` (422) |
| Recusar contato opt-out | `CONTACT_OPTED_OUT` (409) |
| Recusar desconectado | `WHATSAPP_DISCONNECTED` (409) |
| Uma execução por conversa | `RUN_ALREADY_ACTIVE` (409, `models/flow-run.ts`) |
| Voltar conversa ao modo automação ao disparar | `conversationModel.release` em `startManual` |
| Ver execução em andamento e parar | `GET /api/conversations/{id}/runs`, `POST /api/runs/{id}/cancel`, SSE `run.updated` |

O problema é só de UI: `StartFlowMenu` no cabeçalho é um botão de texto, fica `disabled` sem
explicação quando o WhatsApp não está conectado, não fecha com Esc nem clique fora, não tem
busca, e a confirmação não mostra o contato nem avisa que a conversa volta ao modo automação.

**Decision**: feature 100% frontend. Substituir `start-flow-menu.tsx` por `flow-picker.tsx`.

**Rationale**: menor diff possível que atende toda a spec; zero risco no backend.

**Alternatives considered**: (a) adicionar um endpoint "pode disparar?" que devolva o motivo:
rejeitado, o frontend já tem `connection`, `automationOptOut`, `handling` e `runs` em cache;
(b) manter o botão do cabeçalho e só adicionar o ícone: rejeitado pela spec (FR-011, um único
ponto de entrada).

## 2. Ícone sem biblioteca

**Decision**: SVG inline de um raio (bolt), 20×20, `stroke="currentColor"`, dentro de um botão
`size-11` igual ao botão de anexo, com `aria-label="Disparar fluxo"` e `title`.

**Rationale**: o projeto não tem lib de ícones (o anexo usa o caractere "＋"); um SVG de 3 linhas
não justifica dependência (constituição V). `currentColor` herda `text-ink`, que já passa AA
sobre `bg-paper`/`bg-mist` (`styles/contrast.test.ts`).

**Alternatives considered**: `lucide-react` (dependência nova para um ícone); caractere "⚡"
(renderiza como emoji colorido em alguns sistemas, quebra a identidade visual).

## 3. Onde o ícone fica e como entra no Composer

**Decision**: `Composer` ganha a prop opcional `leading?: ReactNode`, renderizada na linha de
envio antes do botão de anexo. A página passa `<FlowPicker …/>`.

**Rationale**: o Composer não precisa conhecer automações; a página já tem `selected`
(conversa), `connection` e `queryClient`. Um slot é a menor mudança e mantém o Composer testável
sem mocks de `/api/flows`.

**Alternatives considered**: renderizar o picker dentro do Composer (acopla o Composer aos hooks
de automação e obriga todos os testes do Composer a mockar fluxos); colocar o ícone fora do
`<form>` num wrapper na página (quebra o alinhamento na mesma linha do anexo em celular).

## 4. Popup acessível: teclado e clique fora

**Decision**: hook `lib/use-popup.ts` com `{ open, setOpen, rootRef, buttonRef, onKeyDown }`:
fecha em Esc (devolvendo o foco ao botão), fecha em `mousedown` fora do `rootRef`, move o foco
entre `[role="menuitem"]:not(:disabled)` com setas. Lógica copiada de `components/bi/menu.tsx`,
que passa a consumir o hook (tarefa opcional, sem mudança de comportamento).

**Rationale**: dois usos concretos justificam a abstração (constituição V). A API nativa
`popover` faria o light-dismiss de graça, mas jsdom (Vitest) não implementa `showPopover`, o
que exigiria polyfill nos testes; e a navegação por setas continuaria manual.

**Alternatives considered**: `<dialog>` modal (bloqueia a página inteira, exagero para um menu);
Radix/Headless UI (dependência nova).

## 5. Estados do seletor e prioridade entre eles

**Decision**: uma função pura `pickerState({ isConnected, automationOptOut, activeRun, flows,
isLoading })` devolve um dos estados: `disconnected` → `opted_out` → `running` → `loading` →
`empty` → `list`, nessa ordem de precedência. Ver [data-model.md](./data-model.md).

**Rationale**: os impedimentos vêm de dados já em cache (`useConnection`, conversa,
`useConversationRuns`), então o seletor pode explicar o motivo **antes** de chamar a API, e o
erro da API fica como segunda linha de defesa (FR-008). Função pura = teste unitário trivial.

**Alternatives considered**: deixar a API recusar e só mostrar o erro: funciona, mas o atendente
só descobre o motivo depois de escolher e confirmar (viola SC-002 na prática).

## 6. Lista atualizada sem recarregar (FR-003)

**Decision**: a query `useStartableFlows` só é montada enquanto o seletor está aberto. Com o
`staleTime` padrão (0) do TanStack Query, cada abertura refaz o `GET /api/flows?status=active`
e mostra o cache anterior enquanto isso. Se a API recusar com `FLOW_NOT_STARTABLE`, o seletor
invalida `['flows']` e volta à lista.

**Rationale**: não existe evento SSE para mudança de status de fluxo (só `run.updated`), e criar
um seria backend para um caso raro. Refetch ao abrir cobre o caso "admin desativou enquanto o
seletor estava fechado"; a invalidação no erro cobre "desativou com o seletor aberto".

**Alternatives considered**: novo evento SSE `flow.changed` (backend + bus para ganho marginal).

## 7. Busca a partir de 10 fluxos (FR-004)

**Decision**: `SEARCH_THRESHOLD = 10`; campo `<input type="search">` com `aria-label="Buscar
fluxo"`, filtro `name.toLowerCase().includes(term)` no cliente; lista ordenada por nome com
`localeCompare('pt-BR')`.

**Rationale**: dezenas de fluxos no máximo; filtrar no cliente é uma linha.

## 8. Contato opt-out: desfazer sem duplicar código

**Decision**: exportar `useHandlingAction` de `handoff-banner.tsx` e usá-lo no picker para o
botão "Permitir automação" (`DELETE /api/contacts/{id}/automation-opt-out`).

**Rationale**: mesma mutação e mesmas invalidações do banner; zero duplicação.

## 9. Confirmação e proteção contra clique duplo

**Decision**: passo de confirmação com "Disparar **{fluxo}** para **{nome ou telefone}**?" e,
se `handling.mode === 'human'`, a linha "A conversa volta para o modo automação.". O botão
Confirmar fica `disabled` enquanto `start.isPending`; sucesso fecha o seletor, erro mantém aberto
com `role="alert"`.

**Rationale**: `useMutation.isPending` já impede a segunda chamada (SC-004); o backend ainda
recusa com `RUN_ALREADY_ACTIVE` se duas abas dispararem.
