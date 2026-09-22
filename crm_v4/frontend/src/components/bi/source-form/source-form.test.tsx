import '@/test/next-navigation'
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Source, SourceField } from '@/lib/bi/types'
import { router } from '@/test/next-navigation'
import { mockApi, renderWithClient } from '@/test/render'
import { SourceForm } from './source-form'

const field = (key: string, overrides: Partial<SourceField> = {}): SourceField => ({
  key,
  label: key,
  type: 'text',
  detectedType: 'text',
  invalidCount: 0,
  ...overrides,
})

const PREVIEW = {
  fields: [field('cliente'), field('valor', { type: 'number', detectedType: 'number', invalidCount: 3 })],
  rows: [
    ['Ana', 10],
    ['Bia', 20],
  ],
  totalRowsRead: 2,
}

const source = (overrides: Partial<Source> = {}): Source => ({
  id: 's1',
  name: 'Vendas',
  kind: 'postgres',
  fields: [field('cliente'), field('valor', { type: 'number', detectedType: 'number' })],
  refreshInterval: '1h',
  rowCount: 10,
  lastRefreshedAt: null,
  lastAttemptAt: null,
  lastError: null,
  isRefreshing: false,
  config: { host: 'db.local', port: 5432, database: 'crm', user: 'leitor', ssl: true, mode: 'table', table: { name: 'vendas' } },
  maskedSecrets: { password: '••••1234' },
  ...overrides,
})

const bodyOf = (fetchMock: ReturnType<typeof mockApi>, method: string, path: string) => {
  const call = fetchMock.mock.calls.find(([url, init]) => String(url) === path && init?.method === method)
  return call ? (JSON.parse(String(call[1]!.body)) as Record<string, unknown>) : undefined
}

beforeEach(() => router.push.mockClear())
afterEach(() => vi.unstubAllGlobals())

describe('SourceForm (create)', () => {
  it.each([
    ['Planilha (arquivo)', 'Arquivo da planilha'],
    ['Planilha online', 'Link da planilha'],
    ['PostgreSQL', 'Endereço (host)'],
    ['MySQL', 'Endereço (host)'],
    ['API', 'Endereço (URL)'],
  ])('kind %s renders its fields', async (kind, fieldLabel) => {
    const { user } = renderWithClient(<SourceForm />)
    await user.click(screen.getByRole('button', { name: new RegExp(`^${kind.replace(/[()]/g, '\\$&')}`) }))
    expect(screen.getByLabelText(fieldLabel)).toBeInTheDocument()
  })

  it('defaults the port by database kind', async () => {
    const { user } = renderWithClient(<SourceForm />)
    await user.click(screen.getByRole('button', { name: /^MySQL/ }))
    expect(screen.getByLabelText('Porta')).toHaveValue(3306)
  })

  it('uploads a spreadsheet, offers its sheets and previews with the chosen one', async () => {
    const fetchMock = mockApi({
      'POST /api/bi/uploads': () => ({ status: 201, body: { storagePath: 'bi/x/v.xlsx', originalFilename: 'v.xlsx', sheets: ['Jan', 'Fev'] } }),
      'POST /api/bi/sources/preview': () => ({ body: PREVIEW }),
    })
    const { user } = renderWithClient(<SourceForm />)
    await user.click(screen.getByRole('button', { name: /^Planilha \(arquivo\)/ }))
    await user.upload(screen.getByLabelText('Arquivo da planilha'), new File(['a'], 'v.xlsx'))

    expect(await screen.findByText('Arquivo: v.xlsx')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Aba'), 'Fev')
    expect(screen.queryByLabelText('Atualização')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Testar e ver prévia' }))

    await screen.findByRole('region', { name: 'Prévia dos dados' })
    expect(bodyOf(fetchMock, 'POST', '/api/bi/sources/preview')).toMatchObject({
      kind: 'spreadsheet_file',
      config: { storagePath: 'bi/x/v.xlsx', originalFilename: 'v.xlsx', sheet: 'Fev', headerRow: 1 },
    })
  })

  it('shows the upload error message', async () => {
    mockApi({ 'POST /api/bi/uploads': () => ({ status: 415, body: { code: 'UNSUPPORTED_FILE', message: 'Envie uma planilha .csv ou .xlsx.' } }) })
    const { user } = renderWithClient(<SourceForm />)
    await user.click(screen.getByRole('button', { name: /^Planilha \(arquivo\)/ }))
    await user.upload(screen.getByLabelText('Arquivo da planilha'), new File(['a'], 'v.xlsx'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Envie uma planilha .csv ou .xlsx.')
  })

  it('database form builds config and secrets and shows the read-only hint', async () => {
    const fetchMock = mockApi({ 'POST /api/bi/sources/preview': () => ({ body: PREVIEW }) })
    const { user } = renderWithClient(<SourceForm />)
    await user.click(screen.getByRole('button', { name: /^PostgreSQL/ }))
    expect(screen.getByText('Somente SELECT; use um usuário com permissão só de leitura.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Endereço (host)'), 'db.local')
    await user.type(screen.getByLabelText('Banco'), 'crm')
    await user.type(screen.getByLabelText('Usuário'), 'leitor')
    await user.type(screen.getByLabelText('Senha'), 's3nha')
    await user.click(screen.getByLabelText('Usar SSL'))
    await user.selectOptions(screen.getByLabelText('O que ler'), 'query')
    await user.type(screen.getByLabelText('Consulta'), 'SELECT 1')
    await user.click(screen.getByRole('button', { name: 'Testar e ver prévia' }))

    await screen.findByRole('region', { name: 'Prévia dos dados' })
    expect(bodyOf(fetchMock, 'POST', '/api/bi/sources/preview')).toMatchObject({
      kind: 'postgres',
      config: { host: 'db.local', port: 5432, database: 'crm', user: 'leitor', ssl: true, mode: 'query', query: 'SELECT 1' },
      secrets: { password: 's3nha' },
    })
  })

  it('validates required fields and focuses the first error', async () => {
    const fetchMock = mockApi({})
    const { user } = renderWithClient(<SourceForm />)
    await user.click(screen.getByRole('button', { name: /^PostgreSQL/ }))
    await user.click(screen.getByRole('button', { name: 'Testar e ver prévia' }))
    expect(screen.getByLabelText('Endereço (host)')).toHaveFocus()
    expect(screen.getByLabelText('Endereço (host)')).toHaveAccessibleDescription('Campo obrigatório.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('API form sends secret headers in secrets.headers', async () => {
    const fetchMock = mockApi({ 'POST /api/bi/sources/preview': () => ({ body: PREVIEW }) })
    const { user } = renderWithClient(<SourceForm />)
    await user.click(screen.getByRole('button', { name: /^API/ }))
    await user.type(screen.getByLabelText('Endereço (URL)'), 'https://api.x.com/v')
    await user.click(screen.getByRole('button', { name: 'Adicionar cabeçalho' }))
    await user.click(screen.getByRole('button', { name: 'Adicionar cabeçalho' }))
    await user.type(screen.getByLabelText('Nome do cabeçalho 1'), 'Accept')
    await user.type(screen.getByLabelText('Valor do cabeçalho 1'), 'application/json')
    await user.type(screen.getByLabelText('Nome do cabeçalho 2'), 'Authorization')
    await user.type(screen.getByLabelText('Valor do cabeçalho 2'), 'Bearer abc')
    await user.click(screen.getAllByLabelText('secreto')[1]!)
    await user.type(screen.getByLabelText('Caminho da lista de itens'), 'data.items')
    await user.click(screen.getByLabelText('Resposta paginada'))
    await user.click(screen.getByRole('button', { name: 'Testar e ver prévia' }))

    await screen.findByRole('region', { name: 'Prévia dos dados' })
    expect(bodyOf(fetchMock, 'POST', '/api/bi/sources/preview')).toMatchObject({
      kind: 'api',
      config: {
        url: 'https://api.x.com/v',
        method: 'GET',
        headers: [{ name: 'Accept', value: 'application/json' }],
        query: [],
        itemsPath: 'data.items',
        pagination: { param: 'page', start: 1, maxPages: 10 },
      },
      secrets: { headers: [{ name: 'Authorization', value: 'Bearer abc' }] },
    })
  })

  async function fillSheetUrl(user: ReturnType<typeof renderWithClient>['user']) {
    await user.click(screen.getByRole('button', { name: /^Planilha online/ }))
    await user.type(screen.getByLabelText('Nome da fonte'), 'Metas')
    await user.type(screen.getByLabelText('Link da planilha'), 'https://docs.google.com/spreadsheets/d/abc')
  }

  it('previews: table with types and invalid count; Save only after a preview of the current inputs', async () => {
    const fetchMock = mockApi({
      'POST /api/bi/sources/preview': () => ({ body: PREVIEW }),
      'POST /api/bi/sources': () => ({ status: 201, body: source({ kind: 'spreadsheet_url' }) }),
    })
    const { user } = renderWithClient(<SourceForm />)
    await fillSheetUrl(user)
    const save = screen.getByRole('button', { name: 'Salvar fonte' })
    expect(save).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Testar e ver prévia' }))
    const table = await screen.findByRole('region', { name: 'Prévia dos dados' })
    expect(within(table).getByText('3 valores inválidos')).toBeInTheDocument()
    expect(within(table).getByText('Número')).toBeInTheDocument()
    expect(within(table).getByText('Ana')).toBeInTheDocument()
    expect(save).toBeEnabled()

    await user.type(screen.getByLabelText('Linha do cabeçalho'), '2')
    expect(save).toBeDisabled()
    await user.clear(screen.getByLabelText('Linha do cabeçalho'))
    await user.type(screen.getByLabelText('Linha do cabeçalho'), '1')
    expect(save).toBeEnabled()

    await user.selectOptions(screen.getByLabelText('Tipo de valor'), 'currency')
    expect(within(screen.getByRole('region', { name: 'Prévia dos dados' })).getByText('Moeda')).toBeInTheDocument()
    await user.click(save)

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/fontes'))
    expect(bodyOf(fetchMock, 'POST', '/api/bi/sources')).toEqual({
      name: 'Metas',
      kind: 'spreadsheet_url',
      config: { url: 'https://docs.google.com/spreadsheets/d/abc', headerRow: 1 },
      refreshInterval: 'manual',
      fieldTypes: { valor: 'currency' },
    })
  })

  it('shows the server message when the preview fails', async () => {
    mockApi({
      'POST /api/bi/sources/preview': () => ({ status: 422, body: { code: 'AUTH_FAILED', message: 'Usuário ou senha do banco recusados.' } }),
    })
    const { user } = renderWithClient(<SourceForm />)
    await fillSheetUrl(user)
    await user.click(screen.getByRole('button', { name: 'Testar e ver prévia' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha do banco recusados.')
    expect(screen.getByRole('button', { name: 'Salvar fonte' })).toBeDisabled()
  })

  it('shows the name-taken message on save', async () => {
    mockApi({
      'POST /api/bi/sources/preview': () => ({ body: PREVIEW }),
      'POST /api/bi/sources': () => ({ status: 409, body: { code: 'SOURCE_NAME_TAKEN', message: 'Já existe uma fonte com esse nome.' } }),
    })
    const { user } = renderWithClient(<SourceForm />)
    await fillSheetUrl(user)
    await user.click(screen.getByRole('button', { name: 'Testar e ver prévia' }))
    await user.click(await screen.findByRole('button', { name: 'Salvar fonte' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma fonte com esse nome.')
  })
})

describe('SourceForm (edit)', () => {
  it('shows the masked password and omits empty secrets in PATCH', async () => {
    const fetchMock = mockApi({ 'PATCH /api/bi/sources/s1': () => ({ body: source() }) })
    const { user } = renderWithClient(<SourceForm source={source()} />)
    expect(screen.getByLabelText('Senha')).toHaveAttribute('placeholder', '••••1234 — deixe em branco para manter')
    expect(screen.queryByRole('button', { name: /^PostgreSQL/ })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Atualização'), '24h')
    await user.clear(screen.getByLabelText('Nome exibido de cliente'))
    await user.type(screen.getByLabelText('Nome exibido de cliente'), 'Cliente')
    await user.click(screen.getByRole('button', { name: 'Salvar fonte' }))

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/fontes'))
    expect(bodyOf(fetchMock, 'PATCH', '/api/bi/sources/s1')).toEqual({ refreshInterval: '24h', fieldLabels: { cliente: 'Cliente' } })
  })

  it('requires a new preview after a config change and sends the new password', async () => {
    const fetchMock = mockApi({
      'POST /api/bi/sources/preview': () => ({ body: PREVIEW }),
      'PATCH /api/bi/sources/s1': () => ({ body: source() }),
    })
    const { user } = renderWithClient(<SourceForm source={source()} />)
    await user.type(screen.getByLabelText('Senha'), 'nova')
    expect(screen.getByRole('button', { name: 'Salvar fonte' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Testar e ver prévia' }))
    await screen.findByRole('region', { name: 'Prévia dos dados' })
    expect(bodyOf(fetchMock, 'POST', '/api/bi/sources/preview')).toMatchObject({ sourceId: 's1' })
    await user.click(screen.getByRole('button', { name: 'Salvar fonte' }))

    await vi.waitFor(() => expect(bodyOf(fetchMock, 'PATCH', '/api/bi/sources/s1')).toMatchObject({ secrets: { password: 'nova' } }))
  })

  it('keeps saved secret headers masked and blank', async () => {
    const api = source({
      kind: 'api',
      config: { url: 'https://api.x.com', method: 'GET', headers: [], query: [] },
      // lib/bi/types says Record<string, string>, but the API sends header lists here.
      maskedSecrets: { headers: [{ name: 'Authorization', value: '••••9f2a' }] } as unknown as Record<string, string>,
    })
    const fetchMock = mockApi({ 'PATCH /api/bi/sources/s1': () => ({ body: api }) })
    const { user } = renderWithClient(<SourceForm source={api} />)
    expect(screen.getByLabelText('Valor do cabeçalho 1')).toHaveAttribute('placeholder', '••••9f2a — deixe em branco para manter')
    await user.clear(screen.getByLabelText('Nome da fonte'))
    await user.type(screen.getByLabelText('Nome da fonte'), 'API Vendas')
    await user.click(screen.getByRole('button', { name: 'Salvar fonte' }))
    await vi.waitFor(() => expect(bodyOf(fetchMock, 'PATCH', '/api/bi/sources/s1')).toEqual({ name: 'API Vendas' }))
  })
})
