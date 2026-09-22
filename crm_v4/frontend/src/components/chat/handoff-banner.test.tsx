import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Handling } from '@/lib/automation-types'
import { mockApi, renderWithClient } from '@/test/render'
import { HandoffBanner } from './handoff-banner'

afterEach(() => vi.unstubAllGlobals())

const automation: Handling = { mode: 'automation', reason: null, summary: null, handoffAt: null, assumedBy: null }
const awaiting: Handling = {
  mode: 'human',
  reason: 'Cliente pediu para falar com uma pessoa',
  summary: 'Contato quer orçamento de 3 sites.',
  handoffAt: '2026-09-22T12:00:00Z',
  assumedBy: null,
}

const setup = (handling: Handling, automationOptOut = false) =>
  renderWithClient(<HandoffBanner conversationId="c1" contactId="k1" handling={handling} automationOptOut={automationOptOut} />)

describe('HandoffBanner', () => {
  it('renders nothing while automation handles the conversation', () => {
    mockApi({})
    const { container } = setup(automation)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows reason and collapsible summary when awaiting a human', async () => {
    mockApi({})
    const { user } = setup(awaiting)
    expect(screen.getByText('Aguardando humano')).toBeInTheDocument()
    expect(screen.getByText('Motivo: Cliente pediu para falar com uma pessoa')).toBeInTheDocument()
    expect(screen.queryByText('Contato quer orçamento de 3 sites.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver resumo' }))
    expect(screen.getByText('Contato quer orçamento de 3 sites.')).toBeInTheDocument()
  })

  it('assumes the conversation', async () => {
    const fetchMock = mockApi({ 'POST /api/conversations/c1/assume': () => ({ body: {} }) })
    const { user } = setup(awaiting)
    await user.click(screen.getByRole('button', { name: 'Assumir' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/conversations/c1/assume', expect.objectContaining({ method: 'POST' })))
  })

  it('shows who assumed it and hides "Assumir"', () => {
    mockApi({})
    setup({ ...awaiting, assumedBy: { id: 'u1', name: 'Bia' } })
    expect(screen.getByText('Assumida por Bia')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assumir' })).not.toBeInTheDocument()
  })

  it('releases back to automation', async () => {
    const fetchMock = mockApi({ 'POST /api/conversations/c1/release': () => ({ body: {} }) })
    const { user } = setup(awaiting)
    await user.click(screen.getByRole('button', { name: 'Devolver para automação' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/conversations/c1/release', expect.anything()))
  })

  it('marks the contact as "não automatizar"', async () => {
    const fetchMock = mockApi({ 'PUT /api/contacts/k1/automation-opt-out': () => ({ body: {} }) })
    const { user } = setup(awaiting)
    await user.click(screen.getByLabelText('Não automatizar este contato'))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/contacts/k1/automation-opt-out', expect.objectContaining({ method: 'PUT' })))
  })

  it('shows the banner for opted-out contacts and reports errors when undoing', async () => {
    mockApi({ 'DELETE /api/contacts/k1/automation-opt-out': () => ({ status: 500, body: { code: 'X', message: 'Falhou ao salvar.' } }) })
    const { user } = setup(automation, true)
    expect(screen.queryByRole('button', { name: 'Devolver para automação' })).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Não automatizar este contato'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou ao salvar.')
  })
})
