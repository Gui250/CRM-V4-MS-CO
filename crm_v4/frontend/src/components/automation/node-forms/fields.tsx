'use client'

import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { Duration } from '@/lib/automation-types'
import { UNIT_LABELS } from '../node-defaults'

const LABEL = 'text-xs font-semibold uppercase tracking-[0.12em] text-ink'
const CONTROL = 'border-b-2 border-ink/20 bg-mist px-3 text-sm outline-none focus:border-brand focus:bg-paper'

export function FieldError({ children }: { children: ReactNode }) {
  return <p className="text-sm text-brand">{children}</p>
}

export function SelectField({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} className={`h-10 ${CONTROL}`} {...props}>
        {children}
      </select>
    </div>
  )
}

export const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; max: number; value: string; error?: string }
>(function TextAreaField({ label, max, value, error, ...props }, ref) {
  const id = useId()
  const over = value.length > max
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <textarea ref={ref} id={id} value={value} rows={4} aria-invalid={over || error ? true : undefined} className={`resize-y py-2 ${CONTROL}`} {...props} />
      <p className={`self-end font-mono text-[11px] ${over ? 'text-brand' : 'text-muted'}`}>
        {value.length}/{max}
      </p>
      {over ? <FieldError>Limite de {max} caracteres.</FieldError> : error ? <FieldError>{error}</FieldError> : null}
    </div>
  )
})

export function DurationField({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: Duration
  onChange: (value: Duration) => void
  error?: string | null
}) {
  const id = useId()
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={`mb-1.5 ${LABEL}`}>{label}</legend>
      <div className="flex gap-2">
        <input
          id={id}
          type="number"
          min={1}
          step={1}
          aria-label={`${label}: quantidade`}
          value={Number.isNaN(value.amount) ? '' : value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.valueAsNumber })}
          className={`h-10 w-24 ${CONTROL}`}
        />
        <select aria-label={`${label}: unidade`} value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value as Duration['unit'] })} className={`h-10 flex-1 ${CONTROL}`}>
          {Object.entries(UNIT_LABELS).map(([unit, text]) => (
            <option key={unit} value={unit}>
              {text}
            </option>
          ))}
        </select>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </fieldset>
  )
}
