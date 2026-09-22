'use client'

import { useState, type FormEvent } from 'react'
import { SelectField } from '@/components/automation/node-forms/fields'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { useStartableFlows, useStartFlowForPhone } from '@/lib/use-automation'

const PHONE = /^\d{10,15}$/

export function NewConversationFlow({ onStarted }: { onStarted: (conversationId: string) => void }) {
  const [phone, setPhone] = useState('')
  const [flowId, setFlowId] = useState('')
  const [touched, setTouched] = useState(false)
  const { data: flows = [] } = useStartableFlows()
  const start = useStartFlowForPhone()

  const phoneError = touched && !PHONE.test(phone) ? 'Informe de 10 a 15 dígitos, com DDI.' : undefined

  function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (!PHONE.test(phone) || !flowId) return
    start.mutate({ phone, flowId }, { onSuccess: (result) => onStarted(result.conversation.id) })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-4" aria-label="Nova conversa com automação">
      <Field
        label="Número"
        inputMode="numeric"
        value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
        hint="com DDI, ex. 5511999999999"
        error={phoneError}
      />
      <SelectField label="Fluxo" value={flowId} onChange={(e) => setFlowId(e.target.value)}>
        <option value="">Escolha um fluxo</option>
        {flows.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </SelectField>
      {start.error && (
        <p role="alert" className="text-sm text-brand">
          {start.error instanceof ApiError ? start.error.message : 'Não foi possível iniciar a conversa.'}
        </p>
      )}
      <Button type="submit" disabled={start.isPending || !flowId}>
        {start.isPending ? 'Iniciando…' : 'Iniciar conversa'}
      </Button>
    </form>
  )
}
