# Quickstart: Painel de Chat do WhatsApp

Guia para rodar e validar a feature de ponta a ponta. Detalhes de API em
[contracts/](./contracts/), de dados em [data-model.md](./data-model.md).

## Pré-requisitos

- Node.js 22 LTS e npm
- Docker + Docker Compose
- Um celular com WhatsApp para conectar e outro número para mandar mensagens de teste

## Setup (desenvolvimento)

```bash
cp .env.example .env              # preencher EVOLUTION_API_KEY e EVOLUTION_WEBHOOK_TOKEN
docker compose up -d              # postgres:16 + evolution-api (portas: POSTGRES_PORT / EVOLUTION_PORT)
npm install
npm run db:migrate -w backend     # aplica migrations (tabelas + RLS)
npm run dev                       # backend :3333 e frontend :3000 em paralelo
```

Variáveis principais (`.env`):

| Variável | Dev | Produção |
|---|---|---|
| `POSTGRES_PORT` / `EVOLUTION_PORT` | `5432` / `8080` (troque se já estiverem em uso e ajuste `DATABASE_URL` / `EVOLUTION_URL`) | não usado |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/crm` | connection string do Supabase |
| `STORAGE_DRIVER` | `local` | `supabase` (+ `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`) |
| `EVOLUTION_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE` | container local | instância da empresa |
| `EVOLUTION_WEBHOOK_TOKEN` | qualquer segredo | segredo forte |
| `PUBLIC_BACKEND_URL` | `http://host.docker.internal:3333` (para a Evolution alcançar o webhook) | URL pública do backend |

## Testes

```bash
npm test                                   # todos os testes unitários (Vitest, ambos os apps)
npm test -w backend -- src/models/message.test.ts  # um arquivo
npm run test:coverage -w backend           # falha se models/controllers < 80%
npm run lint && npm run typecheck
```

Nenhum teste precisa de Docker: models usam PGlite em memória, integrações são mockadas.

## Validação manual (mapeada ao spec)

1. **Cadastro e login**: abrir `http://localhost:3000/cadastro`, criar o primeiro usuário → entra
   direto como admin. Em aba anônima, cadastrar um segundo → vê "aguardando aprovação" e o login
   retorna conta pendente. Como admin, em **Usuários**, aprovar → o segundo consegue logar.
2. **Conectar (US2)**: admin em **Conexão** → "Conectar" → QR aparece e se renova; ler com o celular
   → status "Conectado" com o número. Tela do atendente não mostra o botão de conectar.
3. **Receber e responder (US1)**: do outro celular, mandar "oi" → conversa surge no topo com 1 não
   lida em ≤3 s, sem recarregar. Abrir → contador zera. Responder → balão à direita passa por
   enviando → enviada → entregue → lida; chega no celular.
4. **Dois atendentes**: com admin e atendente logados na mesma conversa, a resposta de um aparece
   para o outro com o nome de quem enviou.
5. **Falha e reenvio**: `docker compose stop evolution-api`, enviar mensagem → balão "falhou";
   religar e clicar em reenviar → entregue.
6. **Busca e mídia (US3)**: buscar parte do nome/número → filtra. Receber imagem, áudio, vídeo e
   PDF → exibidos/reproduzíveis/baixáveis. Enviar imagem e documento pelo clipe → chegam.
   Receber figurinha → balão "tipo de mensagem não suportado". Mensagem num grupo → não aparece.
7. **Desconexão**: desconectar pelo celular → aviso de desconexão em todas as telas abertas.
8. **Offline**: com uma conversa aberta e texto digitado, desligar a rede do navegador → aviso
   "Sem conexão com a internet"; religar → aviso some, o texto continua no campo e o que chegou
   no intervalo aparece.
9. **Desempenho (SC-004)**: `npm run db:seed:perf -w backend` e abrir o chat → a lista aparece em
   menos de 2 s.
10. **Marca (US4)**: logo V4 e "V4 Company MS&CO" no menu de todas as telas; botões primários
   vermelhos com texto branco; em largura < 768 px, lista e conversa aparecem uma de cada vez.

## Produção (Supabase)

1. Criar projeto no Supabase e um bucket de Storage privado.
2. Apontar `DATABASE_URL` para o Supabase e rodar `npm run db:migrate -w backend`.
3. Conferir no painel do Supabase que todas as tabelas estão com RLS ativo.
4. `STORAGE_DRIVER=supabase` e `PUBLIC_BACKEND_URL` com a URL pública do backend (HTTPS).
