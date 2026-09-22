import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  jsonb,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

const citext = customType<{ data: string }>({ dataType: () => 'citext' })
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' })

export const userRole = pgEnum('user_role', ['admin', 'attendant'])
export const userStatus = pgEnum('user_status', ['pending', 'active', 'disabled'])
export const connectionStatus = pgEnum('connection_status', [
  'disconnected',
  'awaiting_qr',
  'connected',
])
export const messageDirection = pgEnum('message_direction', ['inbound', 'outbound'])
export const messageType = pgEnum('message_type', [
  'text',
  'image',
  'audio',
  'video',
  'document',
  'unsupported',
])
export const messageStatus = pgEnum('message_status', [
  'pending',
  'sent',
  'delivered',
  'read',
  'failed',
])

export const stageKind = pgEnum('stage_kind', ['open', 'won', 'lost'])
export const stageColor = pgEnum('stage_color', [
  'gray',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
])

// Automações e agentes de IA (feature 003)
export const aiVendor = pgEnum('ai_vendor', ['openai', 'anthropic', 'gemini'])
export const aiTestStatus = pgEnum('ai_test_status', ['ok', 'failed'])
export const flowStatus = pgEnum('flow_status', ['draft', 'active', 'inactive'])
export const flowTriggerType = pgEnum('flow_trigger_type', ['message_received', 'manual'])
export const runStatus = pgEnum('run_status', ['running', 'waiting', 'completed', 'failed', 'cancelled'])
export const runOrigin = pgEnum('run_origin', ['message_received', 'manual', 'test'])
export const stepStatus = pgEnum('step_status', ['ok', 'failed'])
export const handlingMode = pgEnum('handling_mode', ['automation', 'human'])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

const id = uuid('id').primaryKey().defaultRandom()

export const users = pgTable('users', {
  id,
  name: text('name').notNull(),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull(),
  status: userStatus('status').notNull(),
  ...timestamps,
})

export const sessions = pgTable('sessions', {
  id,
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
})

export const whatsappConnection = pgTable(
  'whatsapp_connection',
  {
    id,
    singleton: boolean('singleton').notNull().default(true).unique(),
    instanceName: text('instance_name').notNull(),
    status: connectionStatus('status').notNull().default('disconnected'),
    phoneNumber: text('phone_number'),
    lastQr: text('last_qr'),
    lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [check('whatsapp_connection_singleton_check', sql`${table.singleton}`)],
)

export const contacts = pgTable('contacts', {
  id,
  waJid: text('wa_jid').notNull().unique(),
  phone: text('phone').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  automationOptOutAt: timestamp('automation_opt_out_at', { withTimezone: true }),
  automationOptOutByUserId: uuid('automation_opt_out_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
})

export const conversations = pgTable(
  'conversations',
  {
    id,
    contactId: uuid('contact_id')
      .notNull()
      .unique()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastMessagePreview: text('last_message_preview'),
    unreadCount: integer('unread_count').notNull().default(0),
    handlingMode: handlingMode('handling_mode').notNull().default('automation'),
    handoffReason: text('handoff_reason'),
    handoffSummary: text('handoff_summary'),
    handoffAt: timestamp('handoff_at', { withTimezone: true }),
    assumedByUserId: uuid('assumed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    check('conversations_unread_count_check', sql`${table.unreadCount} >= 0`),
    index('conversations_last_message_at_idx').on(table.lastMessageAt.desc()),
  ],
)

export const messages = pgTable(
  'messages',
  {
    id,
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    waMessageId: text('wa_message_id').unique(),
    direction: messageDirection('direction').notNull(),
    type: messageType('type').notNull(),
    body: text('body'),
    mediaPath: text('media_path'),
    mediaMime: text('media_mime'),
    mediaFilename: text('media_filename'),
    mediaSize: integer('media_size'),
    status: messageStatus('status'),
    sentByUserId: uuid('sent_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    error: text('error'),
    flowRunId: uuid('flow_run_id').references((): AnyPgColumn => flowRuns.id, { onDelete: 'set null' }),
    aiAgentId: uuid('ai_agent_id').references((): AnyPgColumn => aiAgents.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    index('messages_conversation_sent_at_idx').on(table.conversationId, table.sentAt.desc()),
    check(
      'messages_status_direction_check',
      sql`(${table.direction} = 'inbound' AND ${table.status} IS NULL) OR (${table.direction} = 'outbound' AND ${table.status} IS NOT NULL)`,
    ),
    check('messages_single_sender_check', sql`NOT (${table.sentByUserId} IS NOT NULL AND ${table.flowRunId} IS NOT NULL)`),
  ],
)

export const pipelines = pgTable(
  'pipelines',
  {
    id,
    name: text('name').notNull(),
    isEntry: boolean('is_entry').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('pipelines_active_name_idx').on(sql`lower(${table.name})`).where(sql`${table.archivedAt} IS NULL`),
    uniqueIndex('pipelines_single_entry_idx')
      .on(table.isEntry)
      .where(sql`${table.isEntry} AND ${table.archivedAt} IS NULL`),
  ],
)

export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id,
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: stageColor('color').notNull().default('gray'),
    kind: stageKind('kind').notNull().default('open'),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('pipeline_stages_name_idx').on(table.pipelineId, sql`lower(${table.name})`),
    index('pipeline_stages_position_idx').on(table.pipelineId, table.position),
  ],
)

export const leads = pgTable(
  'leads',
  {
    id,
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => pipelineStages.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    title: text('title'),
    valueCents: bigint('value_cents', { mode: 'number' }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    lostReason: text('lost_reason'),
    position: doublePrecision('position').notNull(),
    stageEnteredAt: timestamp('stage_entered_at', { withTimezone: true }).notNull().defaultNow(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    unique('leads_pipeline_contact_unique').on(table.pipelineId, table.contactId),
    check('leads_value_cents_check', sql`${table.valueCents} >= 0`),
    index('leads_stage_position_idx').on(table.stageId, table.position, table.id),
    index('leads_contact_idx').on(table.contactId),
    index('leads_assignee_idx').on(table.assigneeId),
  ],
)

export const leadStageChanges = pgTable(
  'lead_stage_changes',
  {
    id,
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    fromStageId: uuid('from_stage_id').references(() => pipelineStages.id, { onDelete: 'set null' }),
    toStageId: uuid('to_stage_id').references(() => pipelineStages.id, { onDelete: 'set null' }),
    fromStageName: text('from_stage_name'),
    toStageName: text('to_stage_name'),
    changedById: uuid('changed_by_id').references(() => users.id, { onDelete: 'set null' }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('lead_stage_changes_lead_idx').on(table.leadId, table.changedAt.desc())],
)

export const aiProviders = pgTable('ai_providers', {
  id,
  name: text('name').notNull().unique(),
  vendor: aiVendor('vendor').notNull(),
  keyCiphertext: bytea('key_ciphertext').notNull(),
  keyIv: bytea('key_iv').notNull(),
  keyAuthTag: bytea('key_auth_tag').notNull(),
  keyHint: text('key_hint').notNull(),
  availableModels: text('available_models').array().notNull().default(sql`'{}'::text[]`),
  lastTestStatus: aiTestStatus('last_test_status').notNull(),
  lastTestedAt: timestamp('last_tested_at', { withTimezone: true }).notNull(),
  ...timestamps,
})

export const aiAgents = pgTable(
  'ai_agents',
  {
    id,
    name: text('name').notNull().unique(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => aiProviders.id, { onDelete: 'restrict' }),
    model: text('model').notNull(),
    instructions: text('instructions').notNull(),
    historySize: integer('history_size').notNull().default(20),
    isActive: boolean('is_active').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [check('ai_agents_history_size_check', sql`${table.historySize} BETWEEN 5 AND 50`)],
)

export const flows = pgTable('flows', {
  id,
  name: text('name').notNull().unique(),
  description: text('description'),
  status: flowStatus('status').notNull().default('draft'),
  triggerType: flowTriggerType('trigger_type'),
  priority: integer('priority').notNull().default(100),
  currentVersionId: uuid('current_version_id').references((): AnyPgColumn => flowVersions.id, { onDelete: 'set null' }),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
})

export const flowVersions = pgTable(
  'flow_versions',
  {
    id,
    flowId: uuid('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    graph: jsonb('graph').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [unique('flow_versions_flow_number_unique').on(table.flowId, table.number)],
)

export const flowRuns = pgTable(
  'flow_runs',
  {
    id,
    flowId: uuid('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => flowVersions.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    origin: runOrigin('origin').notNull(),
    status: runStatus('status').notNull(),
    currentNodeId: text('current_node_id'),
    state: jsonb('state').notNull().default({}),
    resumeAt: timestamp('resume_at', { withTimezone: true }),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    stepsCount: integer('steps_count').notNull().default(0),
    startedByUserId: uuid('started_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    endReason: text('end_reason'),
    error: text('error'),
    ...timestamps,
  },
  (table) => [
    check('flow_runs_steps_count_check', sql`${table.stepsCount} >= 0`),
    uniqueIndex('flow_runs_one_active_per_conversation_idx')
      .on(table.conversationId)
      .where(sql`${table.status} IN ('running', 'waiting')`),
    index('flow_runs_resume_at_idx').on(table.resumeAt).where(sql`${table.status} = 'waiting'`),
    index('flow_runs_flow_started_idx').on(table.flowId, table.startedAt.desc()),
    index('flow_runs_finished_at_idx').on(table.finishedAt).where(sql`${table.finishedAt} IS NOT NULL`),
  ],
)

export const flowRunSteps = pgTable(
  'flow_run_steps',
  {
    id,
    runId: uuid('run_id')
      .notNull()
      .references(() => flowRuns.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    nodeType: text('node_type').notNull(),
    status: stepStatus('status').notNull(),
    input: jsonb('input'),
    output: jsonb('output'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('flow_run_steps_run_idx').on(table.runId, table.startedAt)],
)

export type UserRow = typeof users.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type ConnectionRow = typeof whatsappConnection.$inferSelect
export type ContactRow = typeof contacts.$inferSelect
export type ConversationRow = typeof conversations.$inferSelect
export type MessageRow = typeof messages.$inferSelect
export type PipelineRow = typeof pipelines.$inferSelect
export type StageRow = typeof pipelineStages.$inferSelect
export type LeadRow = typeof leads.$inferSelect
export type LeadStageChangeRow = typeof leadStageChanges.$inferSelect
export type AiProviderRow = typeof aiProviders.$inferSelect
export type AiAgentRow = typeof aiAgents.$inferSelect
export type FlowRow = typeof flows.$inferSelect
export type FlowVersionRow = typeof flowVersions.$inferSelect
export type FlowRunRow = typeof flowRuns.$inferSelect
export type FlowRunStepRow = typeof flowRunSteps.$inferSelect

export * from './schema-bi.js'
