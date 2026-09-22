// Dev-only: creates the source "Vendas perf" with 500,000 captured rows to check SC-002 (visual
// and filter in ≤ 3 s). Run with `npm run db:seed:bi -w backend`.
import { eq } from 'drizzle-orm'
import { loadConfig } from '../src/config.js'
import { createDb } from '../src/db/client.js'
import { biSnapshotRows, biSnapshots, biSources } from '../src/db/schema-bi.js'
import type { SourceField } from '../src/models/bi/definition.js'

const TOTAL = 500_000
const BATCH = 5_000
const NAME = 'Vendas perf'
const SELLERS = Array.from({ length: 40 }, (_, i) => `Vendedor ${String(i + 1).padStart(2, '0')}`)
const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul']
const START = Date.UTC(2024, 0, 1, 3)
const DAY_MS = 86_400_000

const field = (key: string, label: string, type: SourceField['type']): SourceField => ({ key, label, type, detectedType: type, invalidCount: 0 })

const config = loadConfig()
if (!/localhost|127\.0\.0\.1/.test(config.DATABASE_URL)) {
  throw new Error('Recusado: o seed de desempenho só roda contra um banco local.')
}
const { db, close } = createDb(config.DATABASE_URL)

await db.delete(biSources).where(eq(biSources.name, NAME))
const [source] = await db
  .insert(biSources)
  .values({
    name: NAME,
    kind: 'spreadsheet_file',
    config: { storagePath: 'seed', originalFilename: 'seed.csv', headerRow: 1 },
    fields: [field('data', 'Data', 'date'), field('vendedor', 'Vendedor', 'text'), field('regiao', 'Região', 'text'), field('valor', 'Valor', 'currency')],
  })
  .returning()
const [snapshot] = await db.insert(biSnapshots).values({ sourceId: source!.id }).returning()

for (let start = 0; start < TOTAL; start += BATCH) {
  const rows = Array.from({ length: BATCH }, (_, i) => {
    const n = start + i
    return {
      snapshotId: snapshot!.id,
      rowNum: n,
      data: {
        data: new Date(START + (n % 900) * DAY_MS).toISOString(),
        vendedor: SELLERS[n % SELLERS.length],
        regiao: REGIONS[n % REGIONS.length],
        valor: Math.round(((n * 7919) % 500_000) / 10) / 10,
      },
    }
  })
  await db.insert(biSnapshotRows).values(rows)
  process.stdout.write(`${Math.min(start + BATCH, TOTAL)}/${TOTAL}\n`)
}

await db.update(biSnapshots).set({ status: 'succeeded', rowCount: TOTAL, finishedAt: new Date() }).where(eq(biSnapshots.id, snapshot!.id))
await db.update(biSources).set({ currentSnapshotId: snapshot!.id }).where(eq(biSources.id, source!.id))
await close()
