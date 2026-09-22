import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Lead, Pipeline } from '@/lib/types'
import { lead, stage } from '@/test/fixtures'
import { mockApi, renderWithClient } from '@/test/render'
import { LeadStrip } from './lead-strip'

afterEach(() => vi.unstubAllGlobals())

const vendas: Pipeline = {
  id: 'p1',
  name: 'Vendas',
  isEntry: true,
  archivedAt: null,
  stages: [stage({ id: 's1', name: 'Novo' }), stage({ id: 's2', name: 'Em contato', position: 1 }), stage({ id: 's3', name: 'Perdido', kind: 'lost', position: 2 })],
}
const posVenda: Pipeline = { id: 'p2', name: 'Pós-venda', isEntry: false, archivedAt: null, stages: [stage({ id: 'o1', pipelineId: 'p2', name: 'Onboarding' })] }

function setup(leads: Lead[], extra: Parameters<typeof mockApi>[0] = {}) {
  const calls: { key: string; body: unknown }[] = []
  mockApi({
    'GET /api/leads': () => ({ body: leads }),
    'GET /api/pipelines': () => ({ body: [vendas, posVenda] }),
    ...Object.fromEntries(
      Object.entries(extra).map(([key, handler]) => [
        key,
        (init: RequestInit | undefined, url: URL) => {
          calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined })
          return handler(init, url)
        },
      ]),
    ),
  })
  return { calls, ...renderWithClient(<LeadStrip contactId="ct1" />) }
}

describe('LeadStrip', () => {
  it('shows pipeline, stage and assignee of each lead of the contact', async () => {
    setup([lead({ stageId: 's2', assignee: { id: 'u1', name: 'Bia' } })])
    const stageSelect = await screen.findByLabelText('Etapa em Vendas')
    expect(stageSelect).toHaveValue('s2')
    expect(screen.getByText('Vendas')).toBeInTheDocument()
    expect(screen.getByText('Bia')).toBeInTheDocument()
  })

  it('changes the stage from the chat, asking a reason for a lost stage', async () => {
    const { user, calls } = setup([lead()], { 'POST /api/leads/l1/move': () => ({ body: lead({ stageId: 's2' }) }) })
    await user.selectOptions(await screen.findByLabelText('Etapa em Vendas'), 's2')
    await waitFor(() => expect(calls[0]).toEqual({ key: 'POST /api/leads/l1/move', body: { stageId: 's2', beforeLeadId: null } }))
    await waitFor(() => expect(screen.getByLabelText('Etapa em Vendas')).toHaveValue('s2'))

    await user.selectOptions(screen.getByLabelText('Etapa em Vendas'), 's3')
    await user.type(screen.getByLabelText('Motivo'), 'Sem orçamento')
    await user.click(screen.getByRole('button', { name: 'Marcar como perdido' }))
    await waitFor(() => expect(calls[1]?.body).toEqual({ stageId: 's3', beforeLeadId: null, lostReason: 'Sem orçamento' }))
  })

  it('creates a lead only in pipelines where the contact is not yet', async () => {
    const created = lead({ id: 'l2', pipelineId: 'p2', stageId: 'o1' })
    const { user, calls } = setup([lead()], { 'POST /api/leads': () => ({ status: 201, body: created }) })
    await user.click(await screen.findByRole('button', { name: '+ Criar lead' }))

    const pipelineSelect = screen.getByLabelText('Funil')
    expect(within(pipelineSelect).getAllByRole('option').map((o) => o.textContent)).toEqual(['Pós-venda'])
    await user.selectOptions(screen.getByLabelText('Etapa'), 'o1')
    await user.click(screen.getByRole('button', { name: 'Criar' }))

    await waitFor(() => expect(calls[0]).toEqual({ key: 'POST /api/leads', body: { pipelineId: 'p2', contactId: 'ct1', stageId: 'o1' } }))
    expect(await screen.findByLabelText('Etapa em Pós-venda')).toHaveValue('o1')
    expect(screen.queryByRole('button', { name: '+ Criar lead' })).not.toBeInTheDocument()
  })

  it('shows a server refusal', async () => {
    const { user } = setup([], { 'POST /api/leads': () => ({ status: 409, body: { code: 'LEAD_EXISTS', message: 'Este contato já é um lead neste funil.' } }) })
    await user.click(await screen.findByRole('button', { name: '+ Criar lead' }))
    await user.click(screen.getByRole('button', { name: 'Criar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este contato já é um lead neste funil.')
  })
})
