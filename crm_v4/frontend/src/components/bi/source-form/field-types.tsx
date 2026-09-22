import { FIELD_TYPES, type FieldType, type SourceField } from '@/lib/bi/types'
import { FIELD_TYPE_LABELS } from '../sources/labels'

export type FieldEdits = { types: Record<string, FieldType>; labels: Record<string, string> }

export const applyEdits = (fields: SourceField[], edits: FieldEdits): SourceField[] =>
  fields.map((field) => ({ ...field, type: edits.types[field.key] ?? field.type, label: edits.labels[field.key] ?? field.label }))

/** Only what differs from `fields`, in the PATCH/POST shape. */
export function changedEdits(fields: SourceField[], edits: FieldEdits) {
  const fieldTypes: Record<string, FieldType> = {}
  const fieldLabels: Record<string, string> = {}
  for (const field of fields) {
    const type = edits.types[field.key]
    const label = edits.labels[field.key]?.trim()
    if (type && type !== field.type) fieldTypes[field.key] = type
    if (label && label !== field.label) fieldLabels[field.key] = label
  }
  return {
    ...(Object.keys(fieldTypes).length ? { fieldTypes } : {}),
    ...(Object.keys(fieldLabels).length ? { fieldLabels } : {}),
  }
}

const cellClass = 'h-9 w-full border-b-2 border-ink/20 bg-mist px-2 text-sm outline-none focus:border-brand focus:bg-paper'

export function FieldTypes({ fields, edits, onChange }: { fields: SourceField[]; edits: FieldEdits; onChange: (edits: FieldEdits) => void }) {
  const current = applyEdits(fields, edits)
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.12em]">Campos</legend>
      <p className="text-xs text-muted">Corrija o tipo ou o nome exibido de cada campo. Mudar um tipo reprocessa os dados da fonte.</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted">
              <th scope="col" className="py-1 pr-3 font-semibold">Coluna</th>
              <th scope="col" className="py-1 pr-3 font-semibold">Nome exibido</th>
              <th scope="col" className="py-1 pr-3 font-semibold">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {current.map((field) => (
              <tr key={field.key}>
                <td className="py-1 pr-3 font-mono text-xs">{field.key}</td>
                <td className="py-1 pr-3">
                  <input
                    aria-label={`Nome exibido de ${field.key}`}
                    value={field.label}
                    onChange={(e) => onChange({ ...edits, labels: { ...edits.labels, [field.key]: e.target.value } })}
                    className={cellClass}
                  />
                </td>
                <td className="py-1 pr-3">
                  <select
                    aria-label={`Tipo de ${field.key}`}
                    value={field.type}
                    onChange={(e) => onChange({ ...edits, types: { ...edits.types, [field.key]: e.target.value as FieldType } })}
                    className={cellClass}
                  >
                    {FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {FIELD_TYPE_LABELS[type]}
                        {type === field.detectedType ? ' (detectado)' : ''}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </fieldset>
  )
}
