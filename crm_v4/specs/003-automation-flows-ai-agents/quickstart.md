# Quickstart: Fluxos de Automação e Agentes de IA

Guia para validar a feature de ponta a ponta. Setup base igual à feature 001
([quickstart](../001-whatsapp-chat-panel/quickstart.md)); API em [contracts/](./contracts/), dados
em [data-model.md](./data-model.md).

## Pré-requisitos

- Tudo da feature 001 funcionando, com o número de WhatsApp **conectado**
- Um segundo celular para fazer o papel do contato
- Pelo menos uma chave de API de IA (OpenAI, Anthropic ou Google Gemini)

## Setup

```bash
# nova variável no .env (32 bytes aleatórios em base64)
echo "AI_CREDENTIALS_KEY=$(openssl rand -base64 32)" >> .env
npm install                       # traz @xyflow/react no frontend
npm run db:migrate -w backend     # tabelas de fluxos, agentes, execuções (+ RLS) e colunas novas
npm run dev
```

| Variável | Dev | Produção |
|---|---|---|
| `AI_CREDENTIALS_KEY` | qualquer valor gerado como acima | segredo forte, **nunca** trocado sem recifrar as chaves (trocar = recadastrar provedores) |

## Testes

```bash
npm test                                                     # tudo, sem Docker e sem rede
npm test -w backend -- src/controllers/automation            # motor e executores de bloco
npm test -w backend -- src/integrations/ai                   # provedores com fetch mockado
npm test -w frontend -- src/components/automation            # editor e painel do bloco
npm run test:coverage -w backend                             # ≥80% em models/controllers
npm run lint && npm run typecheck
```

O motor é testado com relógio falso (`vi.useFakeTimers`) e PGlite: esperas, retomada após
"reinício" (lease vencido), limite de 100 passos e debounce do agente rodam sem esperar tempo real.
Provedores de IA são sempre mockados; nenhum teste chama a rede.

## Validação manual (mapeada ao spec)

1. **Provedor e agente (US2)**: admin em **Automações → Provedores de IA** → cadastrar com chave
   errada → erro de conexão, nada salvo. Com a chave certa → salvo, mostra só os 4 últimos
   caracteres e a lista de modelos. Em **Agentes**, criar "Qualificação" com instruções: "Pergunte
   nome da empresa e faturamento. Se pedirem humano, transfira."
2. **Fluxo de boas-vindas (US1)**: criar fluxo → arrastar gatilho "Mensagem recebida (contato
   novo)" → "Esperar 5 s" → "Enviar texto: Olá, {{contato.primeiro_nome}}!". Tentar ativar com um
   bloco solto → bloco destacado com erro. Conectar tudo → ativar. Do segundo celular (número nunca
   usado) mandar "oi" → recebe a saudação em ~5 s; no painel o balão aparece como
   "Automação: Boas-vindas".
3. **Versão (US1-7)**: com um fluxo de "esperar 2 minutos" em andamento, editar o texto e salvar →
   a execução em curso manda o texto antigo; a próxima, o novo.
4. **Agente respondendo (US2)**: fluxo "mensagem recebida (qualquer)" → bloco do agente. Mandar
   três mensagens seguidas rápido → uma resposta só, em ≤15 s, com base nas três. No painel os
   balões mostram "IA: Qualificação".
5. **Passagem para humano (US3)**: mandar "quero falar com uma pessoa" → agente para, conversa sobe
   com selo "aguardando humano", motivo e resumo no topo. Filtro "Aguardando humano" mostra só ela.
   Mandar mais mensagens → nenhuma resposta automática. Clicar "Devolver para automação" → a
   próxima mensagem volta a ser respondida pelo agente.
6. **Falha do provedor (US2-6)**: trocar a chave do provedor por uma revogada (ou desligar a rede
   do backend) → mandar mensagem → nada é enviado ao contato, conversa vai para humano e a execução
   aparece como falha no histórico com o erro.
7. **Ativar/desativar agente (US2-4)**: desativar o agente → nova mensagem não é respondida; se o
   bloco tiver a saída "agente indisponível" ligada a "Passar para humano", a conversa vai para
   humano.
8. **Disparo pelo chat (US4)**: criar fluxo com gatilho "Disparo manual" e ativar. Numa conversa,
   abrir o menu de automações → só fluxos manuais aparecem → disparar → indicador "automação em
   andamento" com "Parar". Disparar de novo → aviso de que já está rodando. Em "Nova conversa",
   informar um número sem histórico e disparar → conversa criada e mensagem chega.
9. **Histórico e teste (US5)**: no fluxo, **Execuções** → execução falha do passo 6 → caminho
   destacado e o erro no bloco do agente. Num rascunho, "Testar" com o número do segundo celular →
   blocos acendem em tempo real.
10. **Opt-out (FR-028)**: do celular, mandar "parar" → contato marcado "não automatizar"; nenhum
    fluxo roda nele. Atendente desfaz a marcação → fluxos voltam.
11. **Reinício (FR-012)**: com uma execução em "esperar 2 minutos", parar o backend por 1 minuto e
    subir de novo → a mensagem sai no horário (±1 min).
12. **Permissões (FR-029)**: logado como atendente, `/automacoes` não aparece no menu e
    `GET /api/flows` sem filtro devolve 403; o menu de disparo no chat funciona.
