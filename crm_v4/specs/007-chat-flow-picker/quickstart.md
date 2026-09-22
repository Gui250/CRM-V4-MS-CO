# Quickstart: Disparo de Fluxos pelo Painel da Conversa

Guia de validação. Detalhes de estados em [data-model.md](./data-model.md) e de UI em
[contracts/ui-contract.md](./contracts/ui-contract.md).

## 1. Pré-requisitos

- Ambiente da feature 001/003 rodando: `docker compose up -d`, `.env` preenchido,
  `npm run db:migrate -w backend`, `npm run dev` na raiz.
- Um usuário admin e um atendente (segundo cadastro aprovado pelo admin).
- WhatsApp conectado em **Conexão**.
- Pelo menos um fluxo **ativo** em **Automações** (ex.: "Follow-up": gatilho disparo manual →
  enviar texto). Para testar a busca, 10 ou mais fluxos ativos (duplicar um fluxo várias vezes).

## 2. Validação manual (por história)

### US1: escolher e disparar

1. Abrir uma conversa existente. Na barra de envio, à esquerda do "＋" de anexo, há um ícone de
   raio com dica "Disparar fluxo". No cabeçalho **não** há mais o botão "Automações".
2. Clicar no ícone: abre um painel acima da barra listando os fluxos ativos em ordem alfabética,
   com nome e descrição.
3. Com 10+ fluxos: aparece "Buscar fluxo"; digitar filtra a lista enquanto digita.
4. Escolher um fluxo: aparece "Disparar **Follow-up** para **{nome ou telefone}**?".
5. Confirmar: o painel fecha e, em até 2 s, a faixa "Automação em andamento: Follow-up" aparece
   com "Parar". A mensagem do fluxo chega ao celular e aparece no chat marcada como automação.
6. Repetir em celular (largura < 400 px): o painel cabe na tela e a lista rola por dentro.

### US2: impedimentos explicados

1. Desconectar o WhatsApp em **Conexão**; voltar à conversa; o ícone continua clicável; ao
   clicar: "O WhatsApp está desconectado. Conecte o número para disparar automações." com link
   "Conectar WhatsApp". Reconectar: reabrir mostra a lista sem recarregar a página.
2. Marcar "Não automatizar este contato" na faixa de atendimento; abrir o picker: aviso de
   opt-out com "Permitir automação"; clicar: a lista aparece e o checkbox da faixa desmarca.
3. Com uma automação em andamento: abrir o picker mostra "Automação em andamento: Follow-up" e
   "Parar"; parar: a lista volta.
4. Com o picker na confirmação, desativar o fluxo em outra aba (admin) e confirmar: alerta
   "Este fluxo não pode ser disparado manualmente." e a lista atualiza sem o fluxo.
5. Esc fecha e devolve o foco ao ícone; clicar fora fecha; trocar de conversa fecha.
6. Teclado: Tab até o ícone, Enter abre, setas percorrem, Enter escolhe, Esc fecha.

### US3: único ponto de entrada

1. Cabeçalho da conversa sem "Automações".
2. "Nova conversa com automação" na lateral continua criando a conversa e disparando o fluxo.

## 3. Testes automatizados

```bash
npm test -w frontend -- src/components/chat/flow-picker      # estados, disparo, teclado
npm test -w frontend -- src/lib/use-popup                    # Esc, clique fora, setas
npm test -w frontend -- src/components/chat/composer         # slot leading
npm test -w frontend -- src/components/chat                  # nada do chat regrediu
npm test -w frontend -- src/styles/contrast                  # AA continua passando
npm run lint && npm run typecheck
npm test                                                     # ambos os workspaces
```

Casos obrigatórios em `flow-picker.test.tsx` (um `it` por linha):

- renderiza o botão "Disparar fluxo" habilitado mesmo desconectado
- desconectado: mostra o aviso e o link para `/conexao`, sem chamar `/api/flows`
- opt-out: mostra o aviso e "Permitir automação" chama `DELETE /api/contacts/{id}/automation-opt-out`
- em andamento: mostra o nome do fluxo e "Parar" chama `POST /api/runs/{id}/cancel`
- lista ordenada por nome com descrição; campo de busca só com ≥ 10 fluxos; busca filtra
- vazio: "Nenhum fluxo ativo." e link para `/automacoes` só para admin
- confirmação mostra o contato; aviso de modo automação só quando `handling.mode === 'human'`
- confirmar envia `{ flowId }` e fecha; segundo clique durante o pending não dispara de novo
- erro do backend mantém aberto com `role="alert"`; `FLOW_NOT_STARTABLE` refaz `GET /api/flows`
- Esc fecha e devolve o foco; clique fora fecha; setas movem o foco entre itens

## 4. Resultado esperado

- Todos os comandos da seção 3 verdes; cobertura do backend inalterada (nenhum arquivo tocado).
- `git grep StartFlowMenu` não retorna nada.
- Critérios SC-001 a SC-006 da spec verificáveis pelos passos da seção 2.
