# Quickstart: Funis e Pipelines de Leads

Roteiro para validar a feature 002 de ponta a ponta. Pré-requisito: o ambiente da 001 rodando
(`specs/001-whatsapp-chat-panel/quickstart.md`, passos 1–3), com um admin e um atendente ativos.

## 1. Preparar

```bash
npm install                       # traz @dnd-kit/core e @dnd-kit/sortable
npm run db:migrate -w backend     # aplica 0001_pipelines (tabelas, RLS, funil "Vendas")
npm run dev
npm test && npm run lint && npm run typecheck
```

Esperado: testes verdes, cobertura de models/controllers ≥ 80%, e
`select relname from pg_class where relrowsecurity` lista as 4 tabelas novas.

## 2. Funil padrão (US3)

Entre como admin, abra **Funis**. Esperado: funil "Vendas", marcado como funil de entrada, com
Novo, Em contato, Proposta, Ganho e Perdido.

## 3. Montar um funil (US3, SC-002)

Como admin: crie "Pós-venda"; adicione "Onboarding"; arraste-a para a 2ª posição; mude "Perdido"
para "Cancelado" (tipo perda, cor vermelha). Cronometre: menos de 2 minutos. Recarregue: a ordem
se mantém. Tente criar outro "pós-venda": bloqueado com "Já existe um funil com esse nome".

## 4. Entrada automática (US2, SC-004)

Com o WhatsApp conectado, mande uma mensagem de um celular que nunca falou com a empresa.
Esperado: em até 5 s o cartão aparece em "Novo" de "Vendas" (histórico: "automático"). Mande outra
mensagem: nenhum lead duplicado; o cartão mostra não lidas. Sem celular, simule com o webhook da
001 (`contracts/evolution-webhook.md`, `messages.upsert` com `fromMe: false`).

## 5. Quadro e arrastar (US1, SC-001)

Abra "Vendas" em duas janelas (admin e atendente). Arraste o cartão para "Em contato". Esperado: a
outra janela mostra a mudança em até 3 s; contagens e somas das duas colunas mudam. Arraste para
"Perdido": pede motivo; cancelar devolve o cartão. Recarregue: posição persiste.

Teclado: Tab até um cartão, Espaço, setas, Espaço. O cartão muda de etapa e o leitor de tela anuncia.
Em 375 px de largura: o quadro rola na horizontal e "Mover para" funciona.

## 6. Chat ↔ funil (US2, SC-005)

Abra a conversa do contato no chat. Esperado: cabeçalho mostra "Vendas · Em contato"; troque a
etapa ali e veja o quadro mudar. Em "Pós-venda", use "Criar lead". No cartão, "Abrir conversa" leva
ao chat.

## 7. Detalhes e histórico (US4)

Abra o lead, defina valor R$ 5.000 e responsável = atendente. Mova duas vezes. Esperado: histórico
com as mudanças, autor e horário; como atendente, "Meus leads" mostra só esse lead; busca por
parte do número encontra o lead.

## 8. Permissões

Como atendente: move e edita leads, mas não vê criar/editar/reordenar funis e etapas. Chamadas
diretas a `POST /api/pipelines` retornam 403.

## 9. Exclusões e arquivamento

Exclua uma etapa com leads: o sistema pede a etapa destino; os leads mudam e o histórico registra.
Arquive "Pós-venda": some da lista; reative: leads voltam.

## 10. Desempenho (SC-003)

```bash
npm run db:seed:pipelines -w backend   # 2.000 leads no funil "Vendas" (recusa banco não local)
```

Abra o quadro: carrega em menos de 2 s; rolar uma coluna busca mais cartões; contagens mostram o
total.
