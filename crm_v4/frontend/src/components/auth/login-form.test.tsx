import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { router } from '@/test/next-navigation'
import { mockApi, renderWithClient } from '@/test/render'
import { LoginForm } from './login-form'

afterEach(() => {
  vi.unstubAllGlobals()
  router.replace.mockReset()
})

async function submit(user: ReturnType<typeof renderWithClient>['user']) {
  await user.type(screen.getByLabelText('E-mail'), 'ana@x.com')
  await user.type(screen.getByLabelText('Senha'), 'senha-segura')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('LoginForm', () => {
  it('goes to the chat after a successful login', async () => {
    const fetchMock = mockApi({ 'POST /api/auth/login': () => ({ body: { id: '1', status: 'active' } }) })
    const { user } = renderWithClient(<LoginForm />)

    await submit(user)

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ email: 'ana@x.com', password: 'senha-segura' })
    expect(router.replace).toHaveBeenCalledWith('/chat')
  })

  it.each([
    ['INVALID_CREDENTIALS', 401, 'E-mail ou senha incorretos.'],
    ['ACCOUNT_PENDING', 403, 'Sua conta aguarda aprovação de um administrador.'],
    ['ACCOUNT_DISABLED', 403, 'Sua conta está desativada. Fale com um administrador.'],
  ])('shows the server message for %s', async (code, status, message) => {
    mockApi({ 'POST /api/auth/login': () => ({ status, body: { code, message } }) })
    const { user } = renderWithClient(<LoginForm />)

    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(router.replace).not.toHaveBeenCalled()
  })
})
