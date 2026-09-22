# Contrato: definição de relatório e consulta dos componentes

Esquema estrutural em [data-model.md](../data-model.md#reportdefinition-jsonb-schema-zod-em-modelsbidefinitionts);
fonte da verdade em código: `backend/src/models/bi/definition.ts` (Zod). Este documento fixa as
regras que frontend e backend precisam concordar.

## Espaços (slots) por tipo de componente

| Tipo | category | value | legend | columns | Observação |
|---|---|---|---|---|---|
| kpi | — | 1 | — | — | comparação opcional com período anterior (precisa de filtro de data ativo) |
| bar / column | 1 | 1–5 | 0–1 | — | legend só com 1 value |
| line / area | 1 (data ou texto) | 1–5 | 0–1 | — | data ordena cronologicamente |
| pie / donut | 1 | 1 | — | — | |
| funnel | 1 | 1 | — | — | ordem = ordem do valor, decrescente |
| table | 0–5 | 0–5 | — | — | ao menos 1 campo; sem value vira lista de linhas distintas |
| pivot | 1–2 (linhas) | 1 | — | 1 | até 50 colunas distintas |
| filter_list | 1 | — | — | — | grava `Filter{op:'in'}` na página |
| filter_date | 1 (data) | — | — | — | grava `Filter{op:'between'}`; atalhos: 7/30/90 dias, mês atual, ano atual |
| text | — | — | — | — | só `options.text` |

Troca de tipo (US1 cenário 6): o editor mantém os campos cujos slots existem no tipo novo, dentro
do limite; os excedentes ficam em `visual.pendingFields` (só no estado do editor, não salvo) e são
sinalizados.

## Agregação padrão ao soltar campo em `value`

`number`/`currency` → `sum`; qualquer outro tipo → `count`. Mudar é por menu (FR-004).
Agrupamento de data padrão em `category`: `month` se o intervalo dos dados > 90 dias, senão `day`.

## Componente sugerido ao soltar campo na tela (FR-011)

| Campo solto | Componente criado |
|---|---|
| number / currency | kpi (sum) |
| date / datetime | line (category = campo, value = count) |
| text / boolean com ≤ 6 valores | donut (value = count) |
| text / boolean com > 6 valores | bar (value = count, limit 20) |

Soltar um segundo campo num componente existente: data + número em `bar/column` → vira `line`;
texto + número em `kpi` → vira `bar`. Demais combinações apenas preenchem o próximo slot livre.

## Consulta de um componente (`POST /bi/query`)

O frontend monta o `QueryRequest` a partir de:

1. **Slots** do componente → `dimensions` (category, legend/columns) e `measures` (value).
2. **Filtros** = filtros de página + filtros de filtragem cruzada ativos + nível de detalhamento,
   mantendo só os que se aplicam ao componente: o filtro se aplica se `filter.sourceId ===
   visual.sourceId` ou se existe relacionamento entre as duas fontes (o backend então traduz para
   `IN (subconsulta)` pela chave). Filtros que não se aplicam são ignorados sem erro.
3. **Campos calculados** usados pelo componente, copiados de `definition.calculatedFields`.

Chave de cache no TanStack Query: `['bi-query', request]`.

## Filtragem cruzada e detalhamento (estado de visualização, nunca salvo)

```text
ViewState (por página, só no navegador; FR-019)
  crossFilter?: { visualId, sourceId, field, value }  # um por vez; clicar de novo limpa
  drill: { [visualId]: { grain, value }[] }           # pilha ano → trimestre → mês → dia
  pageFilterOverrides: { [filterIndex]: Filter }      # quem visualiza mexe no filtro sem salvar
```

- Clique numa barra/fatia/ponto de componente com `options.crossFilter = true` gera
  `crossFilter` sobre o campo da `category` (valor exato; para data agrupada, `between` do
  período). O próprio componente não é filtrado, só destacado.
- Detalhar: substitui o `dateGrain` pelo seguinte e adiciona filtro `between` do período clicado.
- A trilha de filtros (FR-018) lista `pageFilterOverrides` alterados, `crossFilter` e cada nível
  de `drill`, cada um removível.

## Resposta

`QueryResult.rows` vem na ordem das `columns`: dimensões primeiro, medidas depois. Valores:
números como número JSON, datas agrupadas como ISO do início do período no fuso de Brasília,
`null` como vazio, `'Outros'` no grupo excedente (quando `groupOthers`). Formatação pt-BR é feita
no frontend (`lib/format.ts`).
