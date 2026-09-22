'use client'

import { useId } from 'react'
import { Field } from '@/components/ui/input'
import { errorText, useUploadSpreadsheet } from '../sources/use-source-admin'
import { SelectField } from './controls'
import type { Draft, Errors } from './draft'

export type KindFieldsProps = { draft: Draft; onChange: (patch: Partial<Draft>) => void; errors: Errors }

function FileUpload({ draft, onChange, errors }: KindFieldsProps) {
  const id = useId()
  const upload = useUploadSpreadsheet()
  const error = upload.isError ? errorText(upload.error) : errors.upload
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-[0.12em]">
        Arquivo da planilha
      </label>
      <input
        id={id}
        type="file"
        accept=".csv,.xlsx"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help`}
        disabled={upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          upload.mutate(file, { onSuccess: (result) => onChange({ upload: result, sheet: result.sheets[0] ?? '' }) })
        }}
        className="text-sm file:mr-3 file:h-10 file:border file:border-ink/80 file:bg-paper file:px-4 file:font-semibold"
      />
      <p id={`${id}-help`} role={error ? 'alert' : 'status'} className={`text-sm ${error ? 'text-brand' : 'text-muted'}`}>
        {upload.isPending
          ? 'Enviando planilha…'
          : error
            ? error
            : draft.upload
              ? `Arquivo: ${draft.upload.originalFilename}`
              : '.csv ou .xlsx, até 50 MB.'}
      </p>
    </div>
  )
}

export function SpreadsheetFields({ kind, ...props }: KindFieldsProps & { kind: 'spreadsheet_file' | 'spreadsheet_url' }) {
  const { draft, onChange, errors } = props
  // Editing: sheets are only known after a new upload or preview; keep showing the saved one.
  const sheets = draft.upload?.sheets.length ? draft.upload.sheets : draft.sheet ? [draft.sheet] : []
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {kind === 'spreadsheet_file' ? (
        <div className="sm:col-span-2">
          <FileUpload {...props} />
        </div>
      ) : (
        <>
          <Field
            label="Link da planilha"
            type="url"
            className="sm:col-span-2"
            placeholder="https://docs.google.com/spreadsheets/d/…"
            hint="A planilha precisa estar compartilhada para quem tem o link."
            value={draft.url}
            error={errors.url}
            onChange={(e) => onChange({ url: e.target.value })}
          />
          <Field label="ID da aba (gid)" hint="Opcional; está no link depois de gid=." value={draft.gid} onChange={(e) => onChange({ gid: e.target.value })} />
        </>
      )}
      {kind === 'spreadsheet_file' && sheets.length > 0 && (
        <SelectField
          label="Aba"
          value={draft.sheet}
          options={sheets.map((sheet) => ({ value: sheet, label: sheet }))}
          onChange={(e) => onChange({ sheet: e.target.value })}
        />
      )}
      <Field
        label="Linha do cabeçalho"
        type="number"
        min={1}
        value={draft.headerRow}
        error={errors.headerRow}
        onChange={(e) => onChange({ headerRow: e.target.value })}
      />
    </div>
  )
}
