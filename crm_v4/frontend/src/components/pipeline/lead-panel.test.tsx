import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LeadDetail } from '@/lib/types'
import { lead, stage } from '@/test/fixtures'
import { mockApi, renderWithClient } from '@/test/render'
import { LeadPanel } from './lead-panel'

afterEach(() => vi.unstubAllGlobals())

const stages = [stage({ id: 's1', name: 'Novo' }), stage({ id: 's3', name: 'Perdido', kind: 'lost', color: 'red', position: 2 })]
const detail = (overrides: Partial<LeadDetail> = {}): LeadDetail => ({
  ...lead({ valueCents: 100000, assignee: null }),
  notes: null,
  history: [
    { id: 'h2', fromStageName: 'Em contato', toStageName: 'Novo', changedBy: { id: 'u1', name: 'Bia' }, changedAt: '2026-09-22T12:00:00.000Z' },
    { id: 'h1', fromStageName: null, toStageName: 'Em contato', changedBy: null, changedAt: '2026-09-21T12:00:00.000Z' },
  ],
  ...overrides,
})

function setup(data: LeadDetail = detail(), routes: Parameters<typeof mockApi>[0] = {}) {
  const calls: { key: string; body: unknown }[] = []
  mockApi({
    'GET /api/leads/l1': () => ({ body: data }),
    'GET /api/users/assignable': () => ({ body: [{ id: 'u1', name: 'Bia' }, { id: 'u2', name: 'Caio' }] }),
    ...Object.fromEntries(
      Object.entries(routes).map(([key, handler]) => [
        key,
        (init: RequestInit | undefined, url: URL) => {
          calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined })
          return handler(init, url)
        },
      ]),
    ),
  })
  const onClose = vi.fn()
  return { calls, onClose, ...renderWithClient(<LeadPanel leadId="l1" stages={stages} onClose={onClose} />) }
}

describe('LeadPanel', () => {
  it('shows the lead, its stage, conversation link and history newest first', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Carla Mendes' })).toBeInTheDocument()
    expect(screen.getByText('Novo', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir conversa/ })).toHaveAttribute('href', '/chat?c=c1')
    const history = within(screen.getByRole('region', { name: 'Histórico de etapas' })).getAllByRole('listitem')
    expect(history.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Em contato → Novo'),
      expect.stringContaining('Entrou em Em contato'),
    ])
    expect(history[0]).toHaveTextContent('Bia')
    expect(history[1]).toHaveTextContent('automático')
  })

  it('saves only the changed fields, parsing the value in reais', async () => {
    const { user, calls } = setup(detail(), { 'PATCH /api/leads/l1': () => ({ body: lead({ valueCents: 500000 }) }) })
    const value = await screen.findByLabelText('Valor estimado (R$)')
    expect(value).toHaveValue('1.000,00')
    await user.clear(value)
    await user.type(value, '5.000,00')
    await user.selectOptions(screen.getByLabelText('Responsável'), 'u2')
    await user.type(screen.getByLabelText('Anotações'), 'Retornar sexta')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(calls[0]).toEqual({ key: 'PATCH /api/leads/l1', body: { valueCents: 500000, assigneeId: 'u2', notes: 'Retornar sexta' } }))
  })

  it('blocks saving an invalid value', async () => {
    const { user } = setup()
    const value = await screen.findByLabelText('Valor estimado (R$)')
    await user.clear(value)
    await user.type(value, 'abc')
    expect(screen.getByText('Use o formato 5.000,00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('shows the lost reason in a lost stage', async () => {
    setup(detail({ stageId: 's3', lostReason: 'Preço' }))
    expect(await screen.findByText('Preço')).toBeInTheDocument()
  })

  it('deletes after confirmation and closes; Escape closes too', async () => {
    const { user, onClose, calls } = setup(detail(), { 'DELETE /api/leads/l1': () => ({ status: 204 }) })
    await user.click(await screen.findByRole('button', { name: 'Excluir lead' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calls[0]?.key).toBe('DELETE /api/leads/l1')

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
