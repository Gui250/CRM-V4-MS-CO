import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../test/db.js'
import { seedChat } from '../../test/bi-fixtures.js'
import { findInternalSource, listInternalSources, type InternalSource } from './internal-sources.js'
import { executeRows } from './sql.js'

async function readAll(source: InternalSource) {
  const db = await createTestDb()
  await seedChat(db)
  const columns = sql.join(source.fields.map((field) => sql`${field.expr} AS ${sql.identifier(field.key)}`), sql`, `)
  return executeRows<Record<string, unknown>>(db, sql`SELECT ${columns} ${source.from}`)
}

describe('internal sources', () => {
  it('lists the WhatsApp sources with typed, labeled fields', () => {
    expect(listInternalSources().map((source) => source.id)).toEqual(['internal:whatsapp_conversations', 'internal:whatsapp_messages'])
    for (const source of listInternalSources()) {
      for (const field of source.fields) expect(field.type).toBe(field.detectedType)
    }
    expect(findInternalSource('internal:nope')).toBeUndefined()
  })

  it('exposes one row per conversation with message counts', async () => {
    const rows = await readAll(findInternalSource('internal:whatsapp_conversations')!)
    const maria = rows.find((row) => row.contato === 'Maria')
    expect(rows).toHaveLength(2)
    expect(maria).toMatchObject({ total_mensagens: 3, recebidas: 1, enviadas: 2 })
  })

  it('names the attendant for outbound messages and "Contato" for inbound ones', async () => {
    const rows = await readAll(findInternalSource('internal:whatsapp_messages')!)
    expect(rows).toHaveLength(5)
    expect(rows.filter((row) => row.direcao === 'Recebida').every((row) => row.atendente === 'Contato')).toBe(true)
    expect(rows.filter((row) => row.direcao === 'Enviada').map((row) => row.atendente).sort()).toEqual(['Ana', 'Ana', 'Bruno'])
    expect(rows.every((row) => row.tipo === 'Texto')).toBe(true)
  })
})
