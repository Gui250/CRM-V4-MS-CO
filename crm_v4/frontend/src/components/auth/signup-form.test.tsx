import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { router } from '@/test/next-navigation'
import { mockApi, renderWithClient } from '@/test/render'
import { SignupForm } from './signup-form'

afterEach(() => {
  vi.unstubAllGlobals()
  router.replace.mockReset()
})

async function fill(user: ReturnType<typeof renderWithClient>['user'], values: Partial<Record<string, string>> = {}) {
  const v = { name: 'Ana Souza', email: 'ana@x.com', password: 'senha-segura', confirm: 'senha-segura', ...values }
  if (v.name) await user.type(screen.getByLabelText('Nome'), v.name)
  if (v.email) await user.type(screen.getByLabelText('E-mail'), v.email)
  if (v.password) await user.type(screen.getByLabelText('Senha'), v.password)
  if (v.confirm) await user.type(screen.getByLabelText('Confirmar senha'), v.confirm)
  await user.click(screen.getByRole('button', { name: 'Criar conta' }))
}

describe('SignupForm', () => {
  it('validates fields before calling the API', async () => {
    const fetchMock = mockApi({})
    const { user } = renderWithClient(<SignupForm />)

    await fill(user, { name: 'A', email: 'invalido', password: '123', confirm: '999' })

    expect(screen.getByText('Informe um nome entre 2 e 100 caracteres.')).toBeInTheDocument()
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument()
    expect(screen.getByText('A senha precisa ter pelo menos 8 caracteres.')).toBeInTheDocument()
    expect(screen.getByText('As senhas não conferem.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('goes straight to the chat when the account is active (first user)', async () => {
    mockApi({ 'POST /api/auth/signup': () => ({ status: 201, body: { status: 'active' } }) })
    const { user } = renderWithClient(<SignupForm />)

    await fill(user)

    expect(router.replace).toHaveBeenCalledWith('/chat')
  })

  it('shows the pending-approval screen for later users', async () => {
    mockApi({ 'POST /api/auth/signup': () => ({ status: 201, body: { status: 'pending' } }) })
    const { user } = renderWithClient(<SignupForm />)

    await fill(user)

    expect(await screen.findByRole('heading', { name: 'Cadastro enviado' })).toBeInTheDocument()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('marks the email field when it is already taken', async () => {
    mockApi({ 'POST /api/auth/signup': () => ({ status: 409, body: { code: 'EMAIL_TAKEN', message: 'x' } }) })
    const { user } = renderWithClient(<SignupForm />)

    await fill(user)

    expect(await screen.findByText('E-mail já cadastrado.')).toBeInTheDocument()
  })
})
