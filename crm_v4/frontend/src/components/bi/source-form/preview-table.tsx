import { formatCell } from '@/lib/bi/format'
import type { SourceField } from '@/lib/bi/types'
import { FIELD_TYPE_LABELS } from '../sources/labels'

/** First rows of the preview; `fields` already carry the user's type/label corrections. */
export function PreviewTable({ fields, rows, totalRowsRead }: { fields: SourceField[]; rows: unknown[][]; totalRowsRead: number }) {
  return (
    <section aria-label="Prévia dos dados" className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        {rows.length} de {totalRowsRead} linhas lidas na amostra.
      </p>
      <div className="max-h-[28rem] overflow-auto border border-line bg-paper">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-ink text-white">
            <tr>
              {fields.map((field) => (
                <th key={field.key} scope="col" className="px-3 py-2 text-left align-top font-semibold whitespace-nowrap">
                  <span className="block">{field.label}</span>
                  <span className="mt-1 inline-block bg-brand px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">{FIELD_TYPE_LABELS[field.type]}</span>
                  {field.invalidCount > 0 && (
                    <span className="mt-1 block text-xs font-normal text-white/80">
                      {field.invalidCount} {field.invalidCount === 1 ? 'valor inválido' : 'valores inválidos'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, r) => (
              <tr key={r}>
                {fields.map((field, c) => (
                  <td key={field.key} className="px-3 py-1.5 whitespace-nowrap">
                    {formatCell(row[c], field.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
