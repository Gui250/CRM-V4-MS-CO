import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../config.js'

const config = loadConfig()
const client = postgres(config.DATABASE_URL, { max: 1, onnotice: () => {} })
await migrate(drizzle(client), {
  migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)),
})
await client.end()
process.stdout.write('Migrations aplicadas.\n')
