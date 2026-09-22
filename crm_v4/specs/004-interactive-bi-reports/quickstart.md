# Quickstart: validar Relatórios de BI Interativos

Guia de validação ponta a ponta. Contratos em [contracts/](./contracts/), modelo em
[data-model.md](./data-model.md).

## Pré-requisitos

Ambiente da feature 001 funcionando (ver `CLAUDE.md`), com algumas conversas no chat. Novas
variáveis no `.env` (também em `.env.example`):

```bash
BI_SECRETS_KEY=$(openssl rand -base64 32)   # cifra credenciais das fontes
BI_ALLOW_PRIVATE_NETWORKS=true              # só em dev: permite o Postgres/MySQL do docker compose
```

```bash
docker compose up -d                # inclui o serviço mysql de teste (profile bi) se quiser testar MySQL
npm install
npm run db:migrate -w backend
npm run dev
```

## 1. Testes automatizados

```bash
npm test                                  # tudo, sem Docker
npm test -w backend -- src/models/bi      # compilador de consulta, expressões, inferência de tipos
npm test -w frontend -- src/components/bi # editor, slots, filtragem cruzada
npm run test:coverage                     # ≥ 80% em models/controllers
npm run lint && npm run typecheck
```

## 2. Relatório sobre dados internos (US1, US3)

1. Login como admin → menu **Relatórios** → **Novo relatório** "Atendimento".
2. Escolha a fonte **Mensagens do WhatsApp**. Arraste da lista de campos para a tela:
   - "Mensagem" → aparece cartão de indicador com a contagem.
   - "Enviada em" → gráfico de linha por dia/mês.
   - "Atendente" → rosca ou barras por atendente.
3. Mude a agregação e o agrupamento de data pelo menu do componente; mova e redimensione.
4. Salve, recarregue: layout e números iguais. **Esperado**: totais batem com o chat (SC-006).
5. Clique numa fatia de atendente → a linha mostra só aquele atendente; trilha mostra o filtro;
   clique de novo ou remova pela trilha → volta ao total.
6. Detalhe um ano → meses → dia; volte um nível.
7. Só teclado: Tab até um campo, menu "Adicionar a…" → componente; setas movem o componente.

Alternativa rápida: **Novo relatório → modelo "Atendimento WhatsApp"**.

## 3. Planilha e sugestões (US2, US4)

1. **Fontes de dados → Nova → Planilha (arquivo)**, envie uma planilha com colunas `data`
   (dd/mm/aaaa), `vendedor`, `valor` (`R$ 1.234,56`) e algumas células `n/d` em `valor`.
2. **Esperado**: prévia de 50 linhas; tipos data, texto, moeda; `valor` com contagem de inválidos.
3. Salve. Num relatório novo com essa fonte, use **Gerar relatório sugerido** → ≥ 4 componentes
   (cartões, série temporal, ranking). Componente com `valor` informa linhas ignoradas.
4. Corrija o tipo de `vendedor` para número e de volta para texto → fonte reprocessa.
5. Envie arquivo > 50 MB → recusado com mensagem.

## 4. Banco externo e API (US4)

- **Postgres**: host `localhost`, porta `POSTGRES_PORT`, banco do CRM, modo consulta
  `SELECT * FROM contacts`. Prévia aparece. Troque por `DELETE FROM contacts` → recusado
  (`QUERY_NOT_READ_ONLY`). Senha errada → mensagem de credencial.
- **API**: `https://jsonplaceholder.typicode.com/users` (GET, sem caminho) → campos achatados
  (`address.city`). Com `BI_ALLOW_PRIVATE_NETWORKS=false`, `http://127.0.0.1:3333` → recusado
  (`HOST_NOT_ALLOWED`).
- Agende a fonte a cada 15 min; com a API fora (URL errada via edição), aguarde a execução →
  relatório mostra "dados de <data>; última atualização falhou".
- Tente excluir fonte usada em relatório → bloqueado listando os relatórios.
- Reabra a fonte: senha/token aparecem só mascarados.

## 5. Compartilhar e exportar (US5)

1. Crie 2 páginas; compartilhe como **visualizar** com um atendente.
2. Entre como o atendente: relatório na lista, filtros funcionam, sem controles de edição.
3. Duas abas como editores diferentes: salve em uma, depois na outra → aviso de conflito com
   opções recarregar/sobrescrever.
4. **Exportar → Imagem** gera PNG; **Exportar → PDF** abre impressão com filtros e data de geração.
5. "Ver dados" num componente → tabela paginada → **Baixar planilha** (CSV abre no Excel com
   acentos e colunas corretas).

## 6. Desempenho (SC-002)

```bash
npm run db:seed:bi -w backend   # fonte "Vendas perf" com 500.000 linhas (recusa DATABASE_URL não local)
```

Relatório com 4 componentes sobre ela: cada componente e cada clique de filtro em ≤ 3 s (aba
Network, `POST /api/bi/query`). Se passar disso, aplicar o plano B de research.md §1.
