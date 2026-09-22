import { useId, type InputHTMLAttributes } from 'react'

export function Field({
  label,
  error,
  hint,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-11 border-b-2 bg-mist px-3 text-base outline-none transition-colors focus:border-brand focus:bg-paper ${error ? 'border-brand' : 'border-ink/20'}`}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-brand">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
