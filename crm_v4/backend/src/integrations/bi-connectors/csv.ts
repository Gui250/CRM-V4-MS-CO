import { pipeline, Readable } from 'node:stream'
import { parse } from 'csv-parse'
import { recordsToRows, type SheetRecord } from './rows.js'

const DELIMITERS = [',', ';', '\t'] as const
const BOM = /^﻿/

/** The candidate that appears most in the line; ties and no match fall back to comma. */
function pickDelimiter(line: string): string {
  const count = (d: string) => line.split(d).length - 1
  return DELIMITERS.reduce((best, d) => (count(d) > count(best) ? d : best))
}

/** Buffers text up to the header row (Brazilian exports use `;` with `,` decimals, so we sniff). */
async function sniff(chunks: AsyncIterator<string>, headerRow: number) {
  let head = ''
  while (head.split('\n').length <= headerRow) {
    const next = await chunks.next()
    if (next.done) break
    head += next.value
  }
  head = head.replace(BOM, '')
  const lines = head.split(/\r?\n/)
  return { head, delimiter: pickDelimiter(lines[headerRow - 1] ?? lines[0] ?? '') }
}

async function* numbered(records: AsyncIterable<string[]>): AsyncGenerator<SheetRecord<string>> {
  let number = 0
  for await (const values of records) yield { number: ++number, values }
}

export async function* readCsv(
  stream: Readable,
  { headerRow }: { headerRow: number },
): AsyncGenerator<Record<string, string>> {
  const chunks = stream.setEncoding('utf8')[Symbol.asyncIterator]() as AsyncIterator<string>
  const { head, delimiter } = await sniff(chunks, headerRow)
  async function* text() {
    yield head
    for (let next = await chunks.next(); !next.done; next = await chunks.next()) yield next.value
  }
  // pipeline (not pipe) so a failing source also fails the parser we iterate.
  const parser = pipeline(Readable.from(text()), parse({ delimiter, relax_column_count: true }), () => {})
  yield* recordsToRows(numbered(parser), headerRow, '')
}
