import { sql, type SQL } from 'drizzle-orm'
import type { FieldType, SourceField } from './definition.js'

/** A column of a report data source: its metadata plus the SQL that computes it. */
export interface DatasetField extends SourceField {
  expr: SQL
}

export interface InternalSource {
  id: string
  name: string
  fields: DatasetField[]
  /** Everything after SELECT's column list: FROM, joins and WHERE. */
  from: SQL
}

const field = (key: string, label: string, type: FieldType, expr: SQL): DatasetField => ({
  key,
  label,
  type,
  detectedType: type,
  invalidCount: 0,
  expr,
})

const contactName = sql`COALESCE(ct.name, ct.phone)`

// Conversation-level counts come from one lateral aggregate so each conversation is a single row.
const conversations: InternalSource = {
  id: 'internal:whatsapp_conversations',
  name: 'Conversas do WhatsApp',
  from: sql`FROM conversations cv
    JOIN contacts ct ON ct.id = cv.contact_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS total,
        count(*) FILTER (WHERE m.direction = 'inbound') AS inbound,
        count(*) FILTER (WHERE m.direction = 'outbound') AS outbound
      FROM messages m WHERE m.conversation_id = cv.id
    ) mc ON true`,
  fields: [
    field('conversa', 'Conversa', 'text', sql`cv.id::text`),
    field('contato', 'Contato', 'text', contactName),
    field('telefone', 'Telefone', 'text', sql`ct.phone`),
    field('criada_em', 'Criada em', 'datetime', sql`cv.created_at`),
    field('ultima_mensagem_em', 'Última mensagem em', 'datetime', sql`cv.last_message_at`),
    field('nao_lidas', 'Não lidas', 'number', sql`cv.unread_count`),
    field('total_mensagens', 'Total de mensagens', 'number', sql`mc.total`),
    field('recebidas', 'Mensagens recebidas', 'number', sql`mc.inbound`),
    field('enviadas', 'Mensagens enviadas', 'number', sql`mc.outbound`),
  ],
}

const messages: InternalSource = {
  id: 'internal:whatsapp_messages',
  name: 'Mensagens do WhatsApp',
  from: sql`FROM messages m
    JOIN conversations cv ON cv.id = m.conversation_id
    JOIN contacts ct ON ct.id = cv.contact_id
    LEFT JOIN users u ON u.id = m.sent_by_user_id`,
  fields: [
    field('mensagem', 'Mensagem', 'text', sql`m.id::text`),
    field('conversa', 'Conversa', 'text', sql`cv.id::text`),
    field('contato', 'Contato', 'text', contactName),
    field('telefone', 'Telefone', 'text', sql`ct.phone`),
    field('direcao', 'Direção', 'text', sql`CASE m.direction WHEN 'inbound' THEN 'Recebida' ELSE 'Enviada' END`),
    field(
      'tipo',
      'Tipo',
      'text',
      sql`CASE m.type WHEN 'text' THEN 'Texto' WHEN 'image' THEN 'Imagem' WHEN 'audio' THEN 'Áudio'
        WHEN 'video' THEN 'Vídeo' WHEN 'document' THEN 'Documento' ELSE 'Outro' END`,
    ),
    field(
      'situacao',
      'Situação',
      'text',
      sql`CASE m.status WHEN 'pending' THEN 'Pendente' WHEN 'sent' THEN 'Enviada' WHEN 'delivered' THEN 'Entregue'
        WHEN 'read' THEN 'Lida' WHEN 'failed' THEN 'Falhou' END`,
    ),
    field('enviada_em', 'Enviada em', 'datetime', sql`m.sent_at`),
    // Outbound messages without a user were sent from the phone itself, outside the panel.
    field(
      'atendente',
      'Atendente',
      'text',
      sql`CASE WHEN m.direction = 'inbound' THEN 'Contato' ELSE COALESCE(u.name, 'Celular') END`,
    ),
  ],
}

const INTERNAL_SOURCES = [conversations, messages]

export const INTERNAL_PREFIX = 'internal:'

export const listInternalSources = (): InternalSource[] => INTERNAL_SOURCES

export const findInternalSource = (id: string): InternalSource | undefined =>
  INTERNAL_SOURCES.find((source) => source.id === id)
