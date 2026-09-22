// Tables for feature 004 (relatórios de BI). Re-exported by schema.ts so drizzle-kit and the db
// client see them; kept apart because the BI tables are large and unrelated to chat/pipelines.
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { ReportDefinition, SourceField } from '../models/bi/definition.js'
import { users } from './schema.js'

const citext = customType<{ data: string }>({ dataType: () => 'citext' })

export const biSourceKind = pgEnum('bi_source_kind', ['spreadsheet_file', 'spreadsheet_url', 'postgres', 'mysql', 'api'])
export const biRefreshInterval = pgEnum('bi_refresh_interval', ['manual', '15m', '1h', '6h', '24h'])
export const biSnapshotStatus = pgEnum('bi_snapshot_status', ['running', 'succeeded', 'failed'])
export const biSharePermission = pgEnum('bi_share_permission', ['edit', 'view'])

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = timestamp('updated_at', { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date())

export const biSources = pgTable(
  'bi_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: citext('name').notNull().unique(),
    kind: biSourceKind('kind').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    secretsEncrypted: text('secrets_encrypted'),
    fields: jsonb('fields').$type<SourceField[]>().notNull().default([]),
    refreshInterval: biRefreshInterval('refresh_interval').notNull().default('manual'),
    nextRefreshAt: timestamp('next_refresh_at', { withTimezone: true }),
    currentSnapshotId: uuid('current_snapshot_id').references((): AnyPgColumn => biSnapshots.id, {
      onDelete: 'set null',
    }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt,
    updatedAt,
  },
  (table) => [index('bi_sources_next_refresh_idx').on(table.nextRefreshAt).where(sql`${table.nextRefreshAt} IS NOT NULL`)],
)

export const biSnapshots = pgTable(
  'bi_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references((): AnyPgColumn => biSources.id, { onDelete: 'cascade' }),
    status: biSnapshotStatus('status').notNull().default('running'),
    rowCount: integer('row_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
  },
  (table) => [
    check('bi_snapshots_row_count_check', sql`${table.rowCount} >= 0`),
    uniqueIndex('bi_snapshots_one_running_idx').on(table.sourceId).where(sql`${table.status} = 'running'`),
  ],
)

export const biSnapshotRows = pgTable(
  'bi_snapshot_rows',
  {
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => biSnapshots.id, { onDelete: 'cascade' }),
    rowNum: integer('row_num').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.snapshotId, table.rowNum] })],
)

export const biRelationships = pgTable(
  'bi_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leftSourceId: text('left_source_id').notNull(),
    leftField: text('left_field').notNull(),
    rightSourceId: text('right_source_id').notNull(),
    rightField: text('right_field').notNull(),
    createdAt,
  },
  (table) => [
    check('bi_relationships_distinct_sources_check', sql`${table.leftSourceId} <> ${table.rightSourceId}`),
    // Same pair in either direction counts as one relationship.
    uniqueIndex('bi_relationships_pair_idx').on(
      sql`least(${table.leftSourceId} || '/' || ${table.leftField}, ${table.rightSourceId} || '/' || ${table.rightField})`,
      sql`greatest(${table.leftSourceId} || '/' || ${table.leftField}, ${table.rightSourceId} || '/' || ${table.rightField})`,
    ),
  ],
)

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    definition: jsonb('definition').$type<ReportDefinition>().notNull(),
    version: integer('version').notNull().default(1),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check('reports_name_length_check', sql`char_length(${table.name}) BETWEEN 1 AND 100`),
    index('reports_owner_idx').on(table.ownerId),
  ],
)

export const reportShares = pgTable(
  'report_shares',
  {
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permission: biSharePermission('permission').notNull(),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.reportId, table.userId] }), index('report_shares_user_idx').on(table.userId)],
)

export type BiSourceRow = typeof biSources.$inferSelect
export type BiSnapshotRow = typeof biSnapshots.$inferSelect
export type BiRelationshipRow = typeof biRelationships.$inferSelect
export type ReportRow = typeof reports.$inferSelect
export type ReportShareRow = typeof reportShares.$inferSelect
