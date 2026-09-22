# Implementation Plan: Tela de edição do fluxo de automação

**Branch**: `005-fix-flow-editor-screen` | **Date**: 2026-09-22 | **Spec**: [spec.md](spec.md)

## Summary

Entregar a tela `/automacoes/[id]` (editor visual) que a lista já usa como destino após criar um
fluxo. Nada novo de arquitetura: é a parte não concluída da feature 003
(`specs/003-automation-flows-ai-agents/plan.md`, tarefas T041 e T042). Tudo o que o editor
precisa já existe: blocos visuais (`node-types/block-node.tsx`), painel de configuração
(`node-config-panel.tsx`), conversão grafo ⇄ React Flow (`graph-convert.ts`), chamadas de
salvar/ativar que preservam `issues` (`lib/flow-issues.ts`), hooks (`use-automation.ts`) e o CSS
do React Flow já importado no layout do painel.

## Technical Context

Herdado da feature 003: Next.js 16 App Router, TanStack Query 5, `@xyflow/react` 12 (já
instalado), Tailwind 4, Vitest + Testing Library (setup já simula `ResizeObserver` e
`DOMMatrixReadOnly` para o React Flow em jsdom).

## Constitution Check

- MVC: só frontend; nenhuma rota, controller ou model muda.
- Testes: `flow-editor.test.tsx` e `automacoes/[id]/page.test.tsx` ao lado do código.
- Zod nas fronteiras: o grafo já é validado no backend (`flowGraphSchema`); o editor só monta o
  grafo e exibe os `issues` do 422.
- Simplicidade: nenhuma dependência nova.

## Project Structure

```text
frontend/src/
├── app/(painel)/automacoes/[id]/page.tsx        ✚ página do editor (+ page.test.tsx)
└── components/automation/flow-editor.tsx        ✚ editor (+ flow-editor.test.tsx)
```

## Design

- `FlowEditor({ flow, readOnly })`: estado local `nodes`/`edges` via `useNodesState` /
  `useEdgesState`, iniciado de `toReactFlow(flow.graph)`. Paleta lateral com um botão por tipo
  de bloco (click-add; arrastar fica de fora, o clique cobre o caso). Conexão validada por
  `canConnect`. Painel `NodeConfigPanel` para o nó selecionado. Toolbar: Salvar
  (`saveFlowGraph`), Ativar (`activateFlow`, salva antes se houver alteração),
  Desativar (`useDeactivateFlow`). `issues` do 422 viram `data.issues` por nó via `issuesByNode`;
  issues sem nó vão para o `ErrorAlert`. `beforeunload` enquanto houver alteração não salva.
- Página: `useParams`, `useMe` (não admin → `AdminOnly`), `useFlow` (404 → "Fluxo não
  encontrado" com link), `Carregando…`, `readOnly` quando `window.innerWidth < 1024`
  (`matchMedia('(max-width: 1023px)')`).
