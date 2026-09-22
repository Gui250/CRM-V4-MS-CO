import { useId, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

// Same look and a11y wiring as `ui/input` Field, for <select> and <textarea>.
type Extra = { label: string; error?: string; hint?: string }

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-ink'
const controlClass = (error?: string) =>
  `border-b-2 bg-mist px-3 text-base outline-none transition-colors focus:border-brand focus:bg-paper ${error ? 'border-brand' : 'border-ink/20'}`

function Help({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error)
    return (
      <p id={`${id}-error`} className="text-sm text-brand">
        {error}
      </p>
    )
  if (hint)
    return (
      <p id={`${id}-hint`} className="text-xs text-muted">
        {hint}
      </p>
    )
  return null
}

const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined)

export function SelectField({
  label,
  error,
  hint,
  options,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & Extra & { options: { value: string; label: string }[] }) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`h-11 ${controlClass(error)}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Help id={id} error={error} hint={hint} />
    </div>
  )
}

export function TextAreaField({ label, error, hint, className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & Extra) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <textarea
        id={id}
        rows={5}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`py-2 font-mono text-sm ${controlClass(error)}`}
        {...props}
      />
      <Help id={id} error={error} hint={hint} />
    </div>
  )
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-brand" />
      {label}
    </label>
  )
}
