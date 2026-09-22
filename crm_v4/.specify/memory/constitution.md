<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0 (MINOR: stack section materially changed; Principle I and IV
  rewritten for the Fastify backend without changing the underlying rules)
- Modified principles:
  - I. Arquitetura MVC: MVC layers now live in `backend/src/` (Fastify); View is `frontend/`
    (Next.js). Adapters are Fastify routes instead of Next.js Route Handlers/Server Actions.
    Layering rules unchanged.
  - III. Testes Unitários: coverage paths updated to `backend/src/models/` and
    `backend/src/controllers/`; "Supabase" in the mocking rule generalized to "banco".
  - IV. Fronteiras Seguras e Tipadas: Server Actions replaced by Fastify routes in the validation
    list; external HTTP API responses added; service role key allowed in backend models or
    integrations (was models only).
  - V. Simplicidade: "Next.js, Node.js e Supabase" → "Next.js, Fastify, Node.js e Postgres".
- Modified sections:
  - Stack e Restrições Técnicas: Fastify backend; own authentication in the backend; local
    Postgres in dev and Supabase Postgres in prod with the same migrations; Supabase Storage in
    prod; Vitest chosen.
- Added sections: none
- Removed sections: none
- Templates: plan/spec/tasks templates read this file at runtime; no edits made (out of scope).
- Deferred TODOs: none
-->

# CRM V4 Company MS&CO Constitution

## Core Principles

### I. Arquitetura MVC

Todo código segue MVC, com responsabilidades estritamente separadas entre dois apps:

- **Model** (`backend/src/models/`): único ponto de acesso ao banco (Postgres) e dono das regras
  de negócio do domínio (leads, pipelines, funis, conversas, fluxos de automação). Models NÃO
  importam nada de Fastify, React, Next.js ou objetos de request/response HTTP.
- **Controller** (`backend/src/controllers/`): orquestra casos de uso: recebe entrada já validada,
  chama models e integrações, devolve um resultado tipado. Controllers NÃO acessam o banco
  diretamente e NÃO conhecem request/response HTTP.
- **View** (`frontend/`, Next.js): páginas e componentes React. Views NÃO acessam o banco nem
  contêm regra de negócio; obtêm dados exclusivamente pela API HTTP do backend.
- Rotas Fastify (`backend/src/routes/`) são adaptadores finos: validar entrada → chamar
  controller → mapear resultado para resposta. Nenhuma lógica de negócio nelas.
- Integrações externas (Evolution API/WhatsApp, Calendly, provedores de IA, storage) ficam em
  `backend/src/integrations/`, atrás de um módulo por provedor, consumidas apenas por controllers
  ou models.
- Dependências fluem em uma direção: View → (HTTP) → Route → Controller → Model/Integration.
  Imports no sentido contrário são proibidos.

**Rationale**: separação clara permite testar regras de negócio sem framework, trocar
provedores (ex.: modelo de IA) sem tocar na UI, e manter o CRM navegável conforme cresce.

### II. Código Limpo

- Nomes revelam intenção: funções são verbos (`createLead`, `moveDealToStage`), booleanos
  começam com `is/has/can`. Sem abreviações obscuras.
- Funções fazem uma coisa. Uma função com mais de ~40 linhas ou mais de 3 níveis de aninhamento
  MUST ser dividida ou justificada no review.
- Um módulo, uma responsabilidade. Arquivos de componente exportam um componente principal.
- Sem código morto, código comentado ou `console.log` em código mergeado; use o logger do
  projeto.
- Sem números/strings mágicos: constantes nomeadas para status, etapas de pipeline, limites.
- Erros são tratados explicitamente: nunca engolir exceções em `catch` vazio; erros de domínio
  usam classes/tipos próprios e são convertidos em respostas HTTP apenas no adaptador.
- TypeScript em modo `strict`. `any` é proibido salvo em fronteira com lib sem tipos, com
  comentário explicando.
- Formatação e lint automatizados (ESLint + Prettier) são a fonte da verdade de estilo; CI
  falha em violações.
- Comentários explicam o *porquê*, não o *o quê*.

**Rationale**: o CRM terá muitas áreas (chat, automações, relatórios, pipelines); legibilidade
é o que mantém o custo de mudança baixo.

### III. Testes Unitários (INEGOCIÁVEL)

- Todo model e controller novo ou alterado MUST ter testes unitários cobrindo o caminho feliz,
  os casos de erro e os casos de borda relevantes.
- Testes unitários não tocam rede nem banco real: banco e integrações externas são substituídos
  por mocks/fakes na fronteira do módulo, ou por banco em memória.
- Componentes de View com lógica (formatação, estados condicionais, drag-and-drop de pipeline)
  MUST ter testes com Testing Library; componentes puramente visuais estão isentos.
- Testes ficam ao lado do código (`*.test.ts` / `*.test.tsx`) e seguem Arrange-Act-Assert,
  com um comportamento por teste e nome que descreve o comportamento esperado.
- Bug corrigido MUST vir acompanhado de um teste que falhava antes da correção.
- A suíte unitária MUST passar localmente e na CI antes de qualquer merge. Cobertura mínima de
  80% de linhas em `backend/src/models/` e `backend/src/controllers/`.

**Rationale**: regras de negócio (distribuição de leads, gatilhos de fluxo, passagem de IA
para humano) quebram silenciosamente sem testes; testes unitários rápidos permitem refatorar
com confiança.

### IV. Fronteiras Seguras e Tipadas

- Toda entrada externa (body/query/params das rotas Fastify, webhooks da Evolution API e
  Calendly, respostas de APIs HTTP externas e de provedores de IA) MUST ser validada com schema
  (ex.: Zod) antes de chegar ao controller.
- Webhooks MUST verificar assinatura/token de origem.
- Segredos (chave service role do Supabase, tokens de API, chaves de IA) vivem apenas em
  variáveis de ambiente do backend; nunca no frontend nem com prefixo `NEXT_PUBLIC_`.
- Tabelas do banco MUST ter Row Level Security habilitada. A chave service role do Supabase só
  pode ser usada no backend, em models ou integrations.

**Rationale**: o CRM armazena dados pessoais de leads e conversas de WhatsApp; falhas nas
fronteiras são o maior risco do sistema.

### V. Simplicidade

- Implementar o que a spec pede, não o que "talvez" seja preciso (YAGNI).
- Preferir recursos nativos de Next.js, Fastify, Node.js e Postgres antes de adicionar
  dependências; toda nova dependência MUST ser justificada no plano.
- Abstrações (interfaces, factories, camadas extras) só quando houver pelo menos dois usos
  concretos, exceto as camadas MVC e os módulos de integração exigidos pelo Princípio I.

**Rationale**: menos código significa menos bugs e menos para testar.

## Stack e Restrições Técnicas

- **Frontend (View)**: Next.js (App Router) com TypeScript.
- **Backend (Model/Controller)**: Node.js LTS + Fastify com TypeScript.
- **Banco**: PostgreSQL. Local (Docker) em desenvolvimento; Supabase Postgres em produção. Os
  dois ambientes rodam o mesmo código e as mesmas migrations versionadas; mudanças de schema
  MUST ser feitas via migration.
- **Autenticação**: própria, implementada no backend (senhas com hash forte, sessão em cookie
  httpOnly). Supabase Auth não é usado, para que desenvolvimento local funcione só com Postgres.
- **Storage de arquivos**: Supabase Storage em produção; disco local em desenvolvimento.
- **Integrações previstas**: Evolution API (WhatsApp), Calendly, múltiplos provedores de IA para
  agentes de automação.
- **Testes**: Vitest + Testing Library, único framework de testes em todo o projeto.
- **Identidade visual**: seguir a marca V4 Company; logo em `./assets`.

## Fluxo de Desenvolvimento e Quality Gates

- Toda feature passa pelo ciclo Spec Kit: `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`.
- O plano de cada feature MUST incluir a seção "Constitution Check" mapeando os arquivos em
  model/controller/view e os testes unitários previstos.
- Em `tasks.md`, tarefas de teste unitário acompanham cada tarefa de model/controller.
- Gates antes do merge: typecheck sem erros, lint sem erros, suíte unitária verde com a
  cobertura mínima do Princípio III, e review confirmando conformidade com esta constituição.

## Governance

- Esta constituição prevalece sobre qualquer outra prática ou convenção do projeto.
- Emendas: propostas via `/speckit-constitution`, com Sync Impact Report, e aprovadas pelo
  responsável técnico do projeto antes do merge.
- Versionamento semântico: MAJOR para remoção ou redefinição incompatível de princípios; MINOR
  para novo princípio ou seção, ou expansão material; PATCH para clarificações e redação.
- Todo review de PR verifica conformidade. Violações só são aceitas com justificativa registrada
  na seção "Complexity Tracking" do plano da feature.
- Guia operacional de runtime para agentes: `CLAUDE.md`.

**Version**: 1.1.0 | **Ratified**: 2026-09-22 | **Last Amended**: 2026-09-22
