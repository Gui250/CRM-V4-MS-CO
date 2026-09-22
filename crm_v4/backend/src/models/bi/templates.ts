// Ready-made reports over internal data (FR-013). Funnel and automation templates arrive with
// features 002 and 003 when their internal sources exist.
import { DEFAULT_VISUAL_LIMIT } from './limits.js'
import type { ReportDefinition } from './definition.js'

export const TEMPLATE_IDS = ['whatsapp_attendance'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

const MSG = 'internal:whatsapp_messages'
const CONV = 'internal:whatsapp_conversations'
const options = { limit: DEFAULT_VISUAL_LIMIT, crossFilter: true }

const whatsappAttendance: ReportDefinition = {
  calculatedFields: [],
  pages: [
    {
      id: 'p1',
      name: 'Atendimento',
      filters: [],
      visuals: [
        { id: 'period', type: 'filter_date', title: 'Período', layout: { x: 0, y: 0, w: 4, h: 2 }, sourceId: MSG, slots: { category: [{ sourceId: MSG, field: 'enviada_em' }] }, options },
        { id: 'messages', type: 'kpi', title: 'Mensagens', layout: { x: 4, y: 0, w: 4, h: 2 }, sourceId: MSG, slots: { value: [{ sourceId: MSG, field: 'mensagem', aggregation: 'count' }] }, options },
        { id: 'conversations', type: 'kpi', title: 'Conversas', layout: { x: 8, y: 0, w: 4, h: 2 }, sourceId: MSG, slots: { value: [{ sourceId: MSG, field: 'conversa', aggregation: 'count_distinct' }] }, options },
        {
          id: 'per-day',
          type: 'line',
          title: 'Mensagens por dia',
          layout: { x: 0, y: 2, w: 8, h: 4 },
          sourceId: MSG,
          slots: { category: [{ sourceId: MSG, field: 'enviada_em', dateGrain: 'day' }], value: [{ sourceId: MSG, field: 'mensagem', aggregation: 'count' }] },
          options,
        },
        {
          id: 'direction',
          type: 'donut',
          title: 'Recebidas × enviadas',
          layout: { x: 8, y: 2, w: 4, h: 4 },
          sourceId: MSG,
          slots: { category: [{ sourceId: MSG, field: 'direcao' }], value: [{ sourceId: MSG, field: 'mensagem', aggregation: 'count' }] },
          options,
        },
        {
          id: 'per-attendant',
          type: 'bar',
          title: 'Mensagens por atendente',
          layout: { x: 0, y: 6, w: 6, h: 4 },
          sourceId: MSG,
          slots: { category: [{ sourceId: MSG, field: 'atendente' }], value: [{ sourceId: MSG, field: 'mensagem', aggregation: 'count' }] },
          options,
        },
        {
          id: 'unread',
          type: 'table',
          title: 'Conversas com mais mensagens não lidas',
          layout: { x: 6, y: 6, w: 6, h: 4 },
          sourceId: CONV,
          slots: { category: [{ sourceId: CONV, field: 'contato' }], value: [{ sourceId: CONV, field: 'nao_lidas', aggregation: 'sum' }] },
          options: { ...options, limit: 10, sort: { by: 'value', dir: 'desc' } },
        },
      ],
    },
  ],
}

const TEMPLATES: Record<TemplateId, ReportDefinition> = { whatsapp_attendance: whatsappAttendance }

export const templateDefinition = (id: TemplateId): ReportDefinition => structuredClone(TEMPLATES[id])
