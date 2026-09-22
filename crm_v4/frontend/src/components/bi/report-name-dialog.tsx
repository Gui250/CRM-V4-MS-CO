'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import { ModalDialog } from './modal-dialog'

export type Template = 'blank' | 'whatsapp_attendance'

const TEMPLATES: { id: Template; label: string; hint: string }[] = [
  { id: 'blank', label: 'Em branco', hint: 'Comece com uma tela vazia.' },
  { id: 'whatsapp_attendance', label: 'Modelo: Atendimento WhatsApp', hint: 'Indicadores e gráficos prontos sobre as conversas.' },
]

/** Asks a report name (new or duplicate); `withTemplate` also offers the starting point. */
export function ReportNameDialog({
  title,
  initialName = '',
  submitLabel,
  withTemplate = false,
  error,
  isPending,
  onSubmit,
  onClose,
}: {
  title: string
  initialName?: string
  submitLabel: string
  withTemplate?: boolean
  error: string | null
  isPending: boolean
  onSubmit: (name: string, template: Template) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [template, setTemplate] = useState<Template>('blank')
  return (
    <ModalDialog title={title} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onSubmit(name.trim(), template)
        }}
      >
        <Field label="Nome do relatório" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        {withTemplate && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold tracking-[0.12em] uppercase">Começar com</legend>
            {TEMPLATES.map((t) => (
              <label key={t.id} className={`flex cursor-pointer gap-3 border p-3 ${template === t.id ? 'border-brand' : 'border-line'}`}>
                <input type="radio" name="template" value={t.id} checked={template === t.id} onChange={() => setTemplate(t.id)} className="accent-brand" />
                <span>
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-xs text-muted">{t.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p role="alert" className="text-sm text-brand">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!name.trim() || isPending}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </ModalDialog>
  )
}
