# Research: Painel de Chat do WhatsApp

Todas as incógnitas do Technical Context resolvidas abaixo.

## 1. Acesso a dados: mesmo código para Postgres local e Supabase

- **Decision**: Drizzle ORM com o driver `postgres`, conectando por `DATABASE_URL`. Em dev aponta
  para o container Postgres; em produção para a connection string do Supabase (pooler em modo
  *session* na porta 5432, ou *transaction* na 6543 com `prepare: false`). Migrations SQL
  versionadas pelo `drizzle-kit`, aplicadas nos dois ambientes.
- **Rationale**: Supabase é Postgres; falando SQL direto, dev e prod rodam o mesmo código e o
  mesmo schema. Drizzle dá tipos a partir do schema e migrations sem runtime pesado.
- **Alternatives considered**: `supabase-js` (não funciona contra Postgres puro); Supabase CLI
  local (`supabase start`, sobe ~10 containers, e o usuário pediu Postgres local); Prisma (engine
  binária maior, migrations menos transparentes); `pg` cru (sem tipos, mais boilerplate).

## 2. RLS com backend próprio

- **Decision**: toda migration de tabela inclui `ALTER TABLE … ENABLE ROW LEVEL SECURITY` sem
  policies. O backend conecta como owner das tabelas, que ignora RLS (sem `FORCE`).
- **Rationale**: cumpre o Princípio IV; no Supabase, bloqueia qualquer acesso via Data API
  (PostgREST com chave anon/authenticated). No Postgres local o comando é válido e inofensivo.
- **Alternatives considered**: policies por usuário (inútil, o usuário final nunca fala direto com
  o banco).

## 3. Autenticação, login e cadastro

- **Decision**: auth própria no Fastify. Senha com argon2id (`@node-rs/argon2`). Sessão opaca:
  token aleatório de 32 bytes num cookie `httpOnly; SameSite=Lax; Secure (prod)`, guardado no banco
  só como hash SHA-256, expira em 7 dias (renovado com uso). Logout apaga a sessão.
  Papéis: `admin` e `attendant`.
  **Cadastro**: o primeiro usuário cadastrado vira `admin` ativo; os seguintes entram como
  `attendant` com status `pending` e só conseguem logar depois que um admin os aprova na tela
  Usuários. Rate limit simples em login/cadastro (`@fastify/rate-limit`).
- **Rationale**: Supabase Auth não existe no Postgres local; sessão no banco permite logout e
  revogação reais. A aprovação evita que qualquer pessoa com a URL se cadastre e leia todas as
  conversas (o spec, FR-013, dá acesso total a todo atendente logado).
- **Alternatives considered**: Supabase Auth (quebra dev local); Auth.js/Lucia/Better Auth (mais
  dependência para 4 endpoints); JWT stateless (sem revogação); cadastro livre sem aprovação
  (expõe dados de clientes).

## 4. Tempo real: navegador

- **Decision**: Server-Sent Events em `GET /api/events` (EventSource nativo, cookie de sessão
  automático). Event bus em memória no backend (`EventEmitter`). Envio de mensagens continua por
  REST. No reconnect, o frontend invalida as queries (TanStack Query) para pegar o que perdeu.
- **Rationale**: o fluxo é servidor → cliente; SSE é nativo, reconecta sozinho, passa por proxies
  HTTP e não precisa de plugin.
- **Alternatives considered**: WebSocket (`@fastify/websocket`, bidirecional desnecessário);
  Supabase Realtime (não existe em dev); polling (não atinge 3 s sem carga alta).
- **Limite conhecido**: pub/sub em memória exige uma instância do backend. Para escalar, trocar por
  Postgres `LISTEN/NOTIFY`.

## 5. Evolution API (v2)

- **Decision**: cliente HTTP fino com `fetch` nativo, header `apikey`. Uma instância fixa
  (`EVOLUTION_INSTANCE`). Endpoints usados:
  - `POST /instance/create`, `GET /instance/connect/{instance}` (QR em base64),
    `GET /instance/connectionState/{instance}`, `DELETE /instance/logout/{instance}`
  - `POST /webhook/set/{instance}` (configurado ao conectar)
  - `POST /message/sendText/{instance}`, `POST /message/sendMedia/{instance}`
  - `POST /chat/getBase64FromMediaMessage/{instance}`, `POST /chat/markMessageAsRead/{instance}`
  Webhook em `POST /api/webhooks/evolution?token=<EVOLUTION_WEBHOOK_TOKEN>` com eventos
  `QRCODE_UPDATED`, `CONNECTION_UPDATE`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE`.
- **Rationale**: a Evolution não assina webhooks; token secreto na URL, comparado em tempo
  constante, é o que ela suporta de forma universal. Idempotência por `wa_message_id` único, porque
  a Evolution pode reentregar eventos.
- **Alternatives considered**: SDK de terceiros para Evolution (pouco mantido); WebSocket da
  Evolution (webhook é mais simples de testar e reprocessar).
- **Filtros**: JIDs `@g.us` (grupos), `status@broadcast` e newsletters são descartados no controller
  do webhook (FR-014).

## 6. Armazenamento de mídia

- **Decision**: ao receber mensagem de mídia, o backend baixa o base64 pela Evolution e salva no
  storage. Driver `local` (pasta `backend/.media/`) em dev, driver `supabase` (Supabase Storage,
  bucket privado, via REST com `fetch` e service role key) em produção, escolhido por
  `STORAGE_DRIVER`. O frontend busca mídia por `GET /api/messages/{id}/media` (autenticado; o backend
  faz stream). Limite de envio: 16 MB (imagem/vídeo), 100 MB (documento).
- **Rationale**: FR-012 exige histórico mesmo com o número desconectado, então a mídia precisa ser
  persistida. Dois drivers são dois usos concretos (Princípio V).
- **Alternatives considered**: buscar mídia sob demanda na Evolution (some com a desconexão);
  `bytea` no Postgres (incha o banco); MinIO/S3 local (mais um container).

## 7. Testes

- **Decision**: Vitest nos dois apps. Models testados contra PGlite (`drizzle-orm/pglite`) com as
  mesmas migrations: sem rede, sem servidor. Controllers testados com models e integrações
  mockados (`vi.mock`/injeção). Rotas com `fastify.inject`. Frontend com Testing Library + jsdom.
  Cobertura com `@vitest/coverage-v8`, limite 80% em `models/` e `controllers/`.
- **Rationale**: a constituição proíbe banco real/rede em teste unitário; PGlite roda Postgres de
  verdade em memória, então as queries são testadas de fato. Um só framework no projeto.
- **Alternatives considered**: Jest (ESM/TS mais trabalhoso); mockar o Drizzle (testa o mock, não a
  query); Testcontainers (é banco real, fica para testes de integração se precisar).

## 8. Frontend e identidade visual

- **Decision**: Next.js App Router, só client/server components de View. Chamadas à API por um
  `fetch` wrapper; TanStack Query para cache, paginação infinita do histórico e invalidação por
  evento SSE. Tailwind 4 com tokens em `@theme`: `--color-brand: #E30613`,
  `--color-brand-dark: #B80510`, branco e cinzas neutros; fonte sem serifa pesada (Montserrat via
  `next/font`); cantos retos ou raio mínimo, ecoando o recorte geométrico do logo. Layout de chat em
  duas colunas (lista | conversa), uma coluna em telas < 768 px (FR-016).
- **Rationale**: TanStack Query resolve paginação e sincronização com eventos sem escrever um
  store manual; Tailwind mantém tokens da marca num só lugar.
- **Alternatives considered**: SWR (paginação infinita mais limitada); biblioteca de componentes
  pronta (brigaria com a identidade visual; pouco ganho para ~6 telas).
- **Contraste**: branco sobre `#E30613` ≈ 4,6:1, passa AA para texto normal.
