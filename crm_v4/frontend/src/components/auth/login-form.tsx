'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import { ApiError, apiFetch } from '@/lib/api'
import type { User } from '@/lib/types'

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    setSubmitting(true)
    try {
      await apiFetch<User>('/api/auth/login', {
        method: 'POST',
        json: { email: form.get('email'), password: form.get('password') },
      })
      router.replace('/chat')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-extrabold uppercase [font-stretch:115%]">Entrar</h1>
        <p className="mt-2 text-sm text-muted">Use o e-mail e a senha da sua conta.</p>
      </header>
      <Field label="E-mail" name="email" type="email" autoComplete="email" required />
      <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
      {error && (
        <p role="alert" className="border-l-4 border-brand bg-brand/5 px-3 py-2 text-sm text-ink">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="h-12">
        {submitting ? 'Entrando…' : 'Entrar'}
      </Button>
      <p className="text-sm text-muted">
        Ainda não tem conta?{' '}
        <Link href="/cadastro" className="font-semibold text-brand underline-offset-4 hover:underline">
          Criar conta
        </Link>
      </p>
    </form>
  )
}
