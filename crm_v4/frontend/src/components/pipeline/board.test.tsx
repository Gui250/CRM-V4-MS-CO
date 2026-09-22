import { QueryClient, useQuery } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_FILTER, boardKey } from '@/lib/pipeline-cache'
import type { Board as BoardData } from '@/lib/types'
import { board, boardStage, lead } from '@/test/fixtures'
import { mockApi, renderWithClient } from '@/test/render'
import { Board } from './board'

afterEach(() => vi.unstubAllGlobals())

const sample = () =>
  board([
    boardStage({
      id: 's1',
      name: 'Novo',
      leads: [
        lead({ id: 'a', position: 0, valueCents: 500000, assignee: { id: 'u1', name: 'Bia' }, unreadCount: 2 }),
        lead({ id: 'b', position: 1024, contact: { id: 'ct2', phone: '5511912345678', name: null, avatarUrl: null } }),
      ],
    }),
    boardStage({ id: 's2', name: 'Em contato', position: 1 }),
    boardStage({ id: 's3', name: 'Perdido', position: 2, kind: 'lost', color: 'red' }),
  ])

/** Reads the board from the query cache like the page does, so optimistic updates re-render. */
function Harness({ onOpenLead, onLoadMore }: { onOpenLead: (id: string) => void; onLoadMore: (s: string, c: string) => Promise<void> }) {
  const { data } = useQuery<BoardData>({ queryKey: boardKey('p1', NO_FILTER), queryFn: () => new Promise(() => {}), staleTime: Infinity })
  return data ? <Board board={data} filter={NO_FILTER} onOpenLead={onOpenLead} onLoadMore={onLoadMore} /> : null
}

function setup(data: BoardData = sample(), onLoadMore = vi.fn(async () => {})) {
  const onOpenLead = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(boardKey('p1', NO_FILTER), data)
  const view = renderWithClient(<Harness onOpenLead={onOpenLead} onLoadMore={onLoadMore} />, client)
  return { ...view, onOpenLead, onLoadMore }
}

const column = (name: string) => screen.getByRole('list', { name: `Leads em ${name}` })
const cardNames = (name: string) =>
  within(column(name))
    .queryAllByRole('button', { name: /Abrir lead/ })
    .map((el) => el.getAttribute('aria-label')!.replace('. Abrir lead', ''))

describe('Board', () => {
  it('renders one column per stage with count, total and cards', () => {
    setup()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Novo', 'Em contato', 'Perdido'])
    expect(screen.getByLabelText('2 leads')).toBeInTheDocument()
    expect(screen.getByLabelText(/Total R\$\s5\.000,00/)).toBeInTheDocument()
    expect(cardNames('Novo')).toEqual(['Carla Mendes', '+55 11 91234-5678'])
    const card = within(column('Novo')).getAllByRole('listitem')[0]!
    expect(within(card).getByText('Bia')).toBeInTheDocument()
    expect(within(card).getByText(/Mensagens não lidas/).parentElement).toHaveTextContent('2')
    expect(within(column('Em contato')).getByText('Nenhum lead nesta etapa')).toBeInTheDocument()
  })

  it('moves a card with "Mover para" optimistically and announces it', async () => {
    let body: unknown
    mockApi({
      'POST /api/leads/a/move': (init) => {
        body = JSON.parse(String(init?.body))
        return { body: lead({ id: 'a', stageId: 's2', position: 0, valueCents: 500000 }) }
      },
    })
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Mover Carla Mendes para'), 's2')

    expect(cardNames('Em contato')).toEqual(['Carla Mendes'])
    expect(body).toEqual({ stageId: 's2', beforeLeadId: null })
    await waitFor(() => expect(screen.getByText('Carla Mendes movido para Em contato.')).toBeInTheDocument())
    expect(screen.getAllByLabelText('1 leads')).toHaveLength(2)
  })

  it('puts the card back and explains when the server refuses', async () => {
    mockApi({ 'POST /api/leads/a/move': () => ({ status: 404, body: { code: 'NOT_FOUND', message: 'Etapa não encontrada.' } }) })
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Mover Carla Mendes para'), 's2')

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('O movimento não foi salvo. Etapa não encontrada.'))
    expect(cardNames('Novo')).toEqual(['Carla Mendes', '+55 11 91234-5678'])
    expect(cardNames('Em contato')).toEqual([])
  })

  it('moves with Alt + arrows: next stage, and reorder within the column', async () => {
    const calls: unknown[] = []
    mockApi({
      'POST /api/leads/a/move': (init) => {
        calls.push(JSON.parse(String(init?.body)))
        return { body: lead({ id: 'a' }) }
      },
    })
    const { user } = setup()
    const card = within(column('Novo')).getAllByRole('button', { name: /Abrir lead/ })[0]!
    card.focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(calls[0]).toEqual({ stageId: 's1', beforeLeadId: null })

    within(column('Novo')).getAllByRole('button', { name: /Carla/ })[0]!.focus()
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')
    await waitFor(() => expect(calls[1]).toEqual({ stageId: 's2', beforeLeadId: null }))
  })

  it('asks for a lost reason before moving to a lost stage; cancel keeps the card', async () => {
    let body: unknown
    mockApi({
      'POST /api/leads/a/move': (init) => {
        body = JSON.parse(String(init?.body))
        return { body: lead({ id: 'a', stageId: 's3', lostReason: 'Preço' }) }
      },
    })
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Mover Carla Mendes para'), 's3')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(cardNames('Novo')).toContain('Carla Mendes')
    expect(body).toBeUndefined()

    await user.selectOptions(screen.getByLabelText('Mover Carla Mendes para'), 's3')
    await user.type(screen.getByLabelText('Motivo'), 'Preço')
    await user.click(screen.getByRole('button', { name: 'Marcar como perdido' }))
    await waitFor(() => expect(body).toEqual({ stageId: 's3', beforeLeadId: null, lostReason: 'Preço' }))
  })

  it('opens the lead with click or Enter', async () => {
    const { user, onOpenLead } = setup()
    const card = within(column('Novo')).getAllByRole('button', { name: /Abrir lead/ })[0]!
    await user.click(card)
    card.focus()
    await user.keyboard('{Enter}')
    expect(onOpenLead).toHaveBeenCalledTimes(2)
    expect(onOpenLead).toHaveBeenCalledWith('a')
  })

  it('loads more cards of a column', async () => {
    const data = board([boardStage({ id: 's1', name: 'Novo', leads: [lead()] }, { nextCursor: 'next', leadCount: 60 })])
    const { user, onLoadMore } = setup(data)
    await user.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect(onLoadMore).toHaveBeenCalledWith('s1', 'next')
  })

  it('links each card to its WhatsApp conversation when there is one', () => {
    const data = board([boardStage({ id: 's1', name: 'Novo', leads: [lead({ id: 'a' }), lead({ id: 'b', conversationId: null, contact: { id: 'k', phone: '5521', name: 'Sem conversa', avatarUrl: null } })] })])
    setup(data)
    expect(screen.getByRole('link', { name: 'Abrir conversa com Carla Mendes' })).toHaveAttribute('href', '/chat?c=c1')
    expect(screen.queryByRole('link', { name: 'Abrir conversa com Sem conversa' })).not.toBeInTheDocument()
  })
})
