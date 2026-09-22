import '@/test/next-navigation'
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Relationship, Source } from '@/lib/bi/types'
import { router } from '@/test/next-navigation'
import { mockApi, renderWithClient } from '@/test/render'
import { RelationshipsPanel } from './relationships-panel'
import { SourceActions } from './source-actions'
import { SourcesList } from './sources-list'

const source = (overrides: Partial<Source>): Source => ({
  id: 's1',
  name: 'Vendas',
  kind: 'spreadsheet_url',
  fields: [
    { key: 'telefone', label: 'telefone', type: 'text', detectedType: 'text', invalidCount: 0 },
    { key: 'valor', label: 'valor', type: 'currency', detectedType: 'number', invalidCount: 0 },
  ],
  refreshInterval: '1h',
  rowCount: 1200,
  lastRefreshedAt: '2026-09-20T13:05:00Z',
  lastAttemptAt: '2026-09-21T13:05:00Z',
  lastError: null,
  isRefreshing: false,
  ...overrides,
})

const whatsapp = source({
  id: 'internal:whatsapp_conversations',
  name: 'Conversas do WhatsApp',
  kind: 'internal',
  fields: [
    { key: 'phone', label: 'telefone', type: 'text', detectedType: 'text', invalidCount: 0 },
    { key: 'unread', label: 'não lidas', type: 'number', detectedType: 'number', invalidCount: 0 },
  ],
})

afterEach(() => {
  vi.unstubAllGlobals()
  router.push.mockClear()
})

describe('SourcesList', () => {
  it('lists external sources with status, error badge and internal ones apart; triggers refresh', async () => {
    const fetchMock = mockApi({
      'GET /api/bi/sources': () => ({ body: [whatsapp, source({ lastError: 'Planilha não encontrada.' }), source({ id: 's2', name: 'Metas', isRefreshing: true })] }),
      'POST /api/bi/sources/s1/refresh': () => ({ status: 202 }),
    })
    const { user } = renderWithClient(<SourcesList />)

    const external = await screen.findByRole('list', { name: 'Fontes externas' })
    expect(within(external).getByText('Planilha não encontrada.')).toBeInTheDocument()
    expect(within(external).getAllByText(/Atualizado em 20\/09\/2026 10:05/)).toHaveLength(2)
    expect(within(external).getByText('Atualizando…')).toBeInTheDocument()
    expect(within(external).queryByText('Conversas do WhatsApp')).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Dados do CRM' })).getByText('Conversas do WhatsApp')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Atualizar agora Metas' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Atualizar agora Vendas' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/bi/sources/s1/refresh', expect.objectContaining({ method: 'POST' })))
  })

  it('shows REFRESH_IN_PROGRESS message', async () => {
    mockApi({
      'GET /api/bi/sources': () => ({ body: [source({})] }),
      'POST /api/bi/sources/s1/refresh': () => ({ status: 409, body: { code: 'REFRESH_IN_PROGRESS', message: 'Já existe uma atualização em andamento.' } }),
    })
    const { user } = renderWithClient(<SourcesList />)
    await user.click(await screen.findByRole('button', { name: 'Atualizar agora Vendas' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma atualização em andamento.')
  })
})

describe('SourceActions', () => {
  it('confirms delete and shows SOURCE_IN_USE message', async () => {
    mockApi({
      'DELETE /api/bi/sources/s1': () => ({
        status: 409,
        body: { code: 'SOURCE_IN_USE', message: 'A fonte é usada pelos relatórios "Mensal". Remova-a deles antes de excluir.' },
      }),
    })
    const { user } = renderWithClient(<SourceActions source={source({})} />)
    await user.click(screen.getByRole('button', { name: 'Excluir fonte' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('relatórios "Mensal"')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('deletes and goes back to the list', async () => {
    mockApi({ 'DELETE /api/bi/sources/s1': () => ({ status: 204 }) })
    const { user } = renderWithClient(<SourceActions source={source({})} />)
    await user.click(screen.getByRole('button', { name: 'Excluir fonte' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/fontes'))
  })
})

describe('RelationshipsPanel', () => {
  const rel: Relationship = { id: 'r1', leftSourceId: 's1', leftField: 'telefone', rightSourceId: whatsapp.id, rightField: 'phone' }

  it('lists and removes relationships', async () => {
    const fetchMock = mockApi({
      'GET /api/bi/sources': () => ({ body: [whatsapp, source({})] }),
      'GET /api/bi/relationships': () => ({ body: [rel] }),
      'DELETE /api/bi/relationships/r1': () => ({ status: 204 }),
    })
    const { user } = renderWithClient(<RelationshipsPanel />)
    const text = 'Vendas.telefone ↔ Conversas do WhatsApp.telefone'
    expect(await screen.findByText(text)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Remover ${text}` }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/bi/relationships/r1', expect.objectContaining({ method: 'DELETE' })))
  })

  it('creates with compatible fields only and shows API errors', async () => {
    const fetchMock = mockApi({
      'GET /api/bi/sources': () => ({ body: [whatsapp, source({})] }),
      'GET /api/bi/relationships': () => ({ body: [] }),
      'POST /api/bi/relationships': () => ({ status: 409, body: { code: 'RELATIONSHIP_EXISTS', message: 'Esse relacionamento já existe.' } }),
    })
    const { user } = renderWithClient(<RelationshipsPanel />)
    await within(screen.getByLabelText('Fonte A')).findByRole('option', { name: 'Vendas' })
    await user.selectOptions(screen.getByLabelText('Fonte A'), 's1')
    await user.selectOptions(screen.getByLabelText('Campo A'), 'telefone')
    await user.selectOptions(screen.getByLabelText('Fonte B'), whatsapp.id)
    const rightField = screen.getByLabelText('Campo B')
    expect(within(rightField).queryByRole('option', { name: 'não lidas' })).not.toBeInTheDocument()
    await user.selectOptions(rightField, 'phone')
    await user.click(screen.getByRole('button', { name: 'Adicionar relacionamento' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Esse relacionamento já existe.')
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(String(post[1]!.body))).toEqual({ leftSourceId: 's1', leftField: 'telefone', rightSourceId: whatsapp.id, rightField: 'phone' })
  })
})
