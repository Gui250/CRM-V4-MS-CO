'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import { AI_VENDOR_LABELS, type AiProvider, type AiVendor } from '@/lib/automation-types'
import {
  useAiProviders,
  useCreateAiProvider,
  useDeleteAiProvider,
  useRetestAiProvider,
  useUpdateAiProvider,
} from '@/lib/use-automation'
import { ErrorAlert, errorMessage, formatDateTime } from './error-alert'

const NAME_MIN = 2
const NAME_MAX = 60
const KEY_MIN = 10
const VENDORS = Object.keys(AI_VENDOR_LABELS) as AiVendor[]

type OnError = (message: string | null) => void

export function ProviderManager() {
  const [error, setError] = useState<string | null>(null)
  const { data: providers = [], isLoading } = useAiProviders()
  return (
    <div className="flex flex-col gap-8">
      <ProviderForm />
      <ErrorAlert message={error} />
      {isLoading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : providers.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nenhum provedor cadastrado.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {providers.map((provider) => (
            <ProviderRow key={provider.id} provider={provider} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function ProviderForm() {
  const [vendor, setVendor] = useState<AiVendor>('openai')
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const create = useCreateAiProvider()
  const isValid = name.trim().length >= NAME_MIN && apiKey.trim().length >= KEY_MIN

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    create.mutate(
      { vendor, name: name.trim(), apiKey: apiKey.trim() },
      {
        onSuccess: () => {
          setName('')
          setApiKey('')
        },
        onError: (err) => setError(errorMessage(err, 'Não foi possível cadastrar o provedor.')),
      },
    )
  }

  return (
    <form onSubmit={submit} aria-label="Novo provedor" className="flex flex-col gap-4 border border-line p-5">
      <h2 className="text-sm font-bold uppercase tracking-[0.12em]">Novo provedor</h2>
      <VendorSelect value={vendor} onChange={setVendor} />
      <Field label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} hint="Ex.: OpenAI produção" />
      <Field label="Chave da API" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      <ErrorAlert message={error} />
      <Button type="submit" disabled={!isValid || create.isPending} className="self-start">
        {create.isPending ? 'Testando conexão…' : 'Testar e salvar'}
      </Button>
    </form>
  )
}

function VendorSelect({ value, onChange }: { value: AiVendor; onChange: (vendor: AiVendor) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]">
      Fornecedor
      <select value={value} onChange={(e) => onChange(e.target.value as AiVendor)} className="h-11 border-b-2 border-ink/20 bg-mist px-3 text-base normal-case tracking-normal">
        {VENDORS.map((v) => (
          <option key={v} value={v}>
            {AI_VENDOR_LABELS[v]}
          </option>
        ))}
      </select>
    </label>
  )
}

function ProviderRow({ provider, onError }: { provider: AiProvider; onError: OnError }) {
  const retest = useRetestAiProvider()
  const remove = useDeleteAiProvider()
  const handlers = { onError: (err: Error) => onError(errorMessage(err)), onSuccess: () => onError(null) }
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">
            {provider.name} <span className="text-xs font-normal text-muted">· {AI_VENDOR_LABELS[provider.vendor]}</span>
          </p>
          <p className="font-mono text-xs text-muted">
            Chave {provider.keyHint} · {provider.availableModels.length} modelos · testado em {formatDateTime(provider.lastTestedAt)} ·{' '}
            {provider.agentCount} agente(s)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={retest.isPending} onClick={() => retest.mutate(provider.id, handlers)}>
            {retest.isPending ? 'Testando…' : 'Testar de novo'}
          </Button>
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(provider.id, handlers)}>
            Excluir
          </Button>
        </div>
      </div>
      <ReplaceKeyForm providerId={provider.id} onError={onError} />
    </li>
  )
}

function ReplaceKeyForm({ providerId, onError }: { providerId: string; onError: OnError }) {
  const [apiKey, setApiKey] = useState('')
  const update = useUpdateAiProvider()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    onError(null)
    update.mutate(
      { id: providerId, apiKey: apiKey.trim() },
      { onSuccess: () => setApiKey(''), onError: (err) => onError(errorMessage(err, 'Não foi possível trocar a chave.')) },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field label="Nova chave" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="flex-1" />
      <Button type="submit" variant="secondary" disabled={apiKey.trim().length < KEY_MIN || update.isPending}>
        {update.isPending ? 'Testando conexão…' : 'Trocar chave'}
      </Button>
    </form>
  )
}
