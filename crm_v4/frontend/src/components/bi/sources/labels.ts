import { formatCell } from '@/lib/bi/format'
import type { FieldType, RefreshInterval, SourceKind } from '@/lib/bi/types'

export const KIND_LABELS: Record<SourceKind, string> = {
  internal: 'Dados do CRM',
  spreadsheet_file: 'Planilha (arquivo)',
  spreadsheet_url: 'Planilha online',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  api: 'API',
}

export const INTERVAL_LABELS: Record<RefreshInterval, string> = {
  manual: 'Manual',
  '15m': 'A cada 15 min',
  '1h': 'A cada 1 h',
  '6h': 'A cada 6 h',
  '24h': 'A cada 24 h',
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texto',
  number: 'Número',
  currency: 'Moeda',
  date: 'Data',
  datetime: 'Data e hora',
  boolean: 'Sim/Não',
}

/** "dd/mm/aaaa hh:mm" in São Paulo time. */
export const formatDateTime = (iso: string) => formatCell(iso, 'datetime')
