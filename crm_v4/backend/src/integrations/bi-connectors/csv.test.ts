import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { MAX_SOURCE_ROWS } from '../../models/bi/limits.js'
import { readCsv } from './csv.js'

const streamOf = (...chunks: string[]) => Readable.from(chunks.map((c) => Buffer.from(c, 'utf8')))

async function collect<T>(rows: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const row of rows) out.push(row)
  return out
}

const read = (text: string, headerRow = 1) => collect(readCsv(streamOf(text), { headerRow }))

describe('readCsv', () => {
  it('reads comma separated files', async () => {
    expect(await read('nome,valor\nAna,10\n')).toEqual([{ nome: 'Ana', valor: '10' }])
  })

  it('detects semicolons, keeping decimal commas inside values', async () => {
    expect(await read('nome;valor\nAna;1,5\n')).toEqual([{ nome: 'Ana', valor: '1,5' }])
  })

  it('detects tabs', async () => {
    expect(await read('nome\tvalor\nAna\t10\n')).toEqual([{ nome: 'Ana', valor: '10' }])
  })

  it('keeps newlines inside quoted values', async () => {
    expect(await read('nome,obs\nAna,"linha 1\nlinha 2"\n')).toEqual([{ nome: 'Ana', obs: 'linha 1\nlinha 2' }])
  })

  it('strips the UTF-8 BOM from the first header', async () => {
    expect(await read('﻿nome,valor\nAna,10\n')).toEqual([{ nome: 'Ana', valor: '10' }])
  })

  it('handles CRLF line endings', async () => {
    expect(await read('nome;valor\r\nAna;10\r\n')).toEqual([{ nome: 'Ana', valor: '10' }])
  })

  it('skips rows above the header row and sniffs the delimiter from it', async () => {
    const rows = await read('Relatório, vendas 2024\n\nnome;valor\nAna;10\n', 3)

    expect(rows).toEqual([{ nome: 'Ana', valor: '10' }])
  })

  it('names empty headers "Coluna N" and suffixes duplicates', async () => {
    const rows = await read('nome,,nome\na,b,c\n')

    expect(rows).toEqual([{ nome: 'a', 'Coluna 2': 'b', 'nome (2)': 'c' }])
  })

  it('fills missing trailing cells with an empty string', async () => {
    expect(await read('a,b\n1\n')).toEqual([{ a: '1', b: '' }])
  })

  it('drops blank rows', async () => {
    expect(await read('a,b\n1,2\n,\n\n3,4\n')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
  })

  it('reads a delimiter split across chunks', async () => {
    const rows = await collect(readCsv(streamOf('no', 'me;va', 'lor\nAna;', '10\n'), { headerRow: 1 }))

    expect(rows).toEqual([{ nome: 'Ana', valor: '10' }])
  })

  it('accepts exactly the row limit', async () => {
    const text = `n\n${'1\n'.repeat(MAX_SOURCE_ROWS)}`

    expect(await read(text)).toHaveLength(MAX_SOURCE_ROWS)
  })

  it('stops with TOO_MANY_ROWS one row past the limit', async () => {
    const text = `n\n${'1\n'.repeat(MAX_SOURCE_ROWS + 1)}`

    await expect(read(text)).rejects.toMatchObject({
      code: 'TOO_MANY_ROWS',
      httpStatus: 422,
      message: 'A planilha passa de 500.000 linhas.',
    })
  })
})
