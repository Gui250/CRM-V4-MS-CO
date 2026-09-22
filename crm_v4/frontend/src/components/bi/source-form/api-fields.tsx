import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import { Checkbox, SelectField, TextAreaField } from './controls'
import { MAX_API_PAGES, type HeaderRow } from './draft'
import type { KindFieldsProps } from './spreadsheet-fields'

const cellClass = 'h-10 min-w-0 flex-1 border-b-2 border-ink/20 bg-mist px-2 text-sm outline-none focus:border-brand focus:bg-paper'

function RowsEditor({
  title,
  noun,
  rows,
  withSecret,
  onChange,
}: {
  title: string
  noun: string
  rows: HeaderRow[]
  withSecret?: boolean
  onChange: (rows: HeaderRow[]) => void
}) {
  const update = (index: number, patch: Partial<HeaderRow>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.12em]">{title}</legend>
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input aria-label={`Nome do ${noun} ${i + 1}`} placeholder="Nome" value={row.name} onChange={(e) => update(i, { name: e.target.value })} className={cellClass} />
          <input
            aria-label={`Valor do ${noun} ${i + 1}`}
            type={row.secret ? 'password' : 'text'}
            autoComplete="off"
            placeholder={row.masked ? `${row.masked} — deixe em branco para manter` : 'Valor'}
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            className={cellClass}
          />
          {withSecret && <Checkbox label="secreto" checked={row.secret} onChange={(secret) => update(i, { secret })} />}
          <Button variant="ghost" className="h-10 px-3" aria-label={`Remover ${noun} ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            ✕
          </Button>
        </div>
      ))}
      <Button variant="secondary" className="h-9 self-start" onClick={() => onChange([...rows, { name: '', value: '', secret: false }])}>
        Adicionar {noun}
      </Button>
    </fieldset>
  )
}

export function ApiFields({ draft, onChange, errors }: KindFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Endereço (URL)"
        type="url"
        className="sm:col-span-2"
        placeholder="https://api.exemplo.com/v1/vendas"
        value={draft.url}
        error={errors.url}
        onChange={(e) => onChange({ url: e.target.value })}
      />
      <SelectField
        label="Método"
        value={draft.method}
        options={[
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
        ]}
        onChange={(e) => onChange({ method: e.target.value === 'POST' ? 'POST' : 'GET' })}
      />
      <Field label="Caminho da lista de itens" hint="Ex.: data.items" value={draft.itemsPath} onChange={(e) => onChange({ itemsPath: e.target.value })} />
      <RowsEditor
        title="Cabeçalhos"
        noun="cabeçalho"
        withSecret
        rows={draft.headers}
        onChange={(headers) => onChange({ headers })}
      />
      <p className="-mt-2 text-xs text-muted sm:col-span-2">Marque &quot;secreto&quot; em tokens e chaves (ex.: Authorization): são guardados criptografados e nunca exibidos de novo.</p>
      <RowsEditor
        title="Parâmetros da URL"
        noun="parâmetro"
        rows={draft.queryParams.map((pair) => ({ ...pair, secret: false }))}
        onChange={(rows) => onChange({ queryParams: rows.map(({ name, value }) => ({ name, value })) })}
      />
      {draft.method === 'POST' && (
        <TextAreaField label="Corpo (JSON)" className="sm:col-span-2" value={draft.body} onChange={(e) => onChange({ body: e.target.value })} />
      )}
      <div className="sm:col-span-2">
        <Checkbox label="Resposta paginada" checked={draft.paginate} onChange={(paginate) => onChange({ paginate })} />
      </div>
      {draft.paginate && (
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
          <Field label="Parâmetro da página" value={draft.pageParam} error={errors.pageParam} onChange={(e) => onChange({ pageParam: e.target.value })} />
          <Field label="Primeira página" type="number" value={draft.pageStart} error={errors.pageStart} onChange={(e) => onChange({ pageStart: e.target.value })} />
          <Field
            label="Máximo de páginas"
            type="number"
            min={1}
            max={MAX_API_PAGES}
            hint={`Até ${MAX_API_PAGES}.`}
            value={draft.maxPages}
            error={errors.maxPages}
            onChange={(e) => onChange({ maxPages: e.target.value })}
          />
        </div>
      )}
    </div>
  )
}
