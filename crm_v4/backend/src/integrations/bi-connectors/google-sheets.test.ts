import { describe, expect, it, vi } from 'vitest'
import { readGoogleSheet, toCsvExportUrl } from './google-sheets.js'

const SHEET = 'https://docs.google.com/spreadsheets/d/abc_DEF-123'
const EXPORT = `${SHEET}/export?format=csv&gid=`

async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const row of rows) out.push(row)
  return out
}

describe('toCsvExportUrl', () => {
  it('takes the gid from the #gid= fragment', () => {
    expect(toCsvExportUrl(`${SHEET}/edit#gid=123`)).toBe(`${EXPORT}123`)
  })

  it('takes the gid from the ?gid= query', () => {
    expect(toCsvExportUrl(`${SHEET}/edit?gid=77`)).toBe(`${EXPORT}77`)
  })

  it('prefers the gid argument', () => {
    expect(toCsvExportUrl(`${SHEET}/edit#gid=123`, '9')).toBe(`${EXPORT}9`)
  })

  it('defaults to the first tab', () => {
    expect(toCsvExportUrl(`${SHEET}/edit`)).toBe(`${EXPORT}0`)
  })

  it.each([
    'https://example.com/spreadsheets/d/abc/edit',
    'http://docs.google.com/spreadsheets/d/abc/edit',
    'https://docs.google.com/document/d/abc/edit',
    'not a url',
  ])('rejects %s', (url) => {
    expect(() => toCsvExportUrl(url)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR', message: 'Use o link de uma planilha do Google Planilhas.' }),
    )
  })
})

const csvResponse = (body: string) => new Response(body, { headers: { 'content-type': 'text/csv' } })

describe('readGoogleSheet', () => {
  const config = { url: `${SHEET}/edit#gid=5`, headerRow: 1 }

  it('fetches the CSV export and parses it', async () => {
    const fetchFake = vi.fn(async () => csvResponse('nome;valor\nAna;10\n'))

    const rows = await collect(readGoogleSheet(config, { allowPrivate: true, fetch: fetchFake }))

    expect(rows).toEqual([{ nome: 'Ana', valor: '10' }])
    expect(fetchFake).toHaveBeenCalledWith(new URL(`${EXPORT}5`), expect.objectContaining({ redirect: 'manual' }))
  })

  it.each([401, 403])('maps HTTP %i to AUTH_FAILED', async (status) => {
    const fetchFake = vi.fn(async () => new Response('', { status }))

    await expect(collect(readGoogleSheet(config, { allowPrivate: true, fetch: fetchFake }))).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      httpStatus: 422,
      message: 'A planilha não está compartilhada por link. Em Compartilhar, escolha "Qualquer pessoa com o link".',
    })
  })

  it('maps an HTML login page to AUTH_FAILED', async () => {
    const fetchFake = vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }))

    await expect(collect(readGoogleSheet(config, { allowPrivate: true, fetch: fetchFake }))).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    })
  })

  it('maps other errors to CONNECTION_FAILED with the status', async () => {
    const fetchFake = vi.fn(async () => new Response('', { status: 500 }))

    await expect(collect(readGoogleSheet(config, { allowPrivate: true, fetch: fetchFake }))).rejects.toMatchObject({
      code: 'CONNECTION_FAILED',
      message: expect.stringContaining('HTTP 500'),
    })
  })
})
