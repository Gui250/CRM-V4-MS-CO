'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import { ApiError, apiFetch } from '@/lib/api'
import type { User } from '@/lib/types'

const NAME_MIN = 2
const NAME_MAX = 100
const PASSWORD_MIN = 8

type Errors = Partial<Record<'name' | 'email' | 'password' | 'confirm', string>>

function validate(values: Record<string, string>): Errors {
  const errors: Errors = {}
  const name = values.name?.trim() ?? ''
  if (name.length < NAME_MIN || name.length > NAME_MAX) errors.name = `Informe um nome entre ${NAME_MIN} e ${NAME_MAX} caracteres.`
  if (!/^\S+@\S+\.\S+$/.test(values.email ?? '')) errors.email = 'Informe um e-mail válido.'
  if ((values.password ?? '').length < PASSWORD_MIN) errors.password = `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`
  if (values.confirm !== values.password) errors.confirm = 'As senhas não conferem.'
  return errors
}

export function SignupForm() {
  const router = useRouter()
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    const found = validate(values)
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    try {
      const user = await apiFetch<User>('/api/auth/signup', {
        method: 'POST',
        json: { name: values.name?.trim(), email: values.email, password: values.password },
      })
      if (user.status === 'active') router.replace('/chat')
      else setPending(true)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setErrors({ email: 'E-mail já cadastrado.' })
      else setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (pending) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="h-1.5 w-12 bg-brand" aria-hidden />
        <h1 className="font-display text-3xl font-extrabold uppercase [font-stretch:115%]">Cadastro enviado</h1>
        <p className="text-muted">
          Um administrador precisa aprovar sua conta. Depois da aprovação, é só entrar com seu e-mail e senha.
        </p>
        <Link href="/login" className="font-semibold text-brand underline-offset-4 hover:underline">
          Ir para o login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-3xl font-extrabold uppercase [font-stretch:115%]">Criar conta</h1>
        <p className="mt-2 text-sm text-muted">Novas contas passam pela aprovação de um administrador.</p>
      </header>
      <Field label="Nome" name="name" autoComplete="name" error={errors.name} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" error={errors.email} />
      <Field label="Senha" name="password" type="password" autoComplete="new-password" error={errors.password} hint={`Mínimo de ${PASSWORD_MIN} caracteres.`} />
      <Field label="Confirmar senha" name="confirm" type="password" autoComplete="new-password" error={errors.confirm} />
      {formError && (
        <p role="alert" className="border-l-4 border-brand bg-brand/5 px-3 py-2 text-sm">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="h-12">
        {submitting ? 'Criando conta…' : 'Criar conta'}
      </Button>
      <p className="text-sm text-muted">
        Já tem conta?{' '}
        <Link href="/login" className="font-semibold text-brand underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  )
}
