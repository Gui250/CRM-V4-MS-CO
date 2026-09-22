import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { message } from '@/test/fixtures'
import { mockApi, renderWithClient } from '@/test/render'
import { Composer } from './composer'

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.unstubAllGlobals())

const setup = (props: Partial<Parameters<typeof Composer>[0]> = {}) => {
  const onSent = vi.fn()
  const view = renderWithClient(<Composer conversationId="c1" disabled={false} onSent={onSent} {...props} />)
  return { ...view, onSent }
}

describe('Composer', () => {
  it('sends trimmed text on Enter and clears the field', async () => {
    const fetchMock = mockApi({ 'POST /api/conversations/c1/messages': () => ({ status: 202, body: message({ id: 'new' }) }) })
    const { user, onSent } = setup()

    await user.type(screen.getByLabelText('Mensagem'), '  olá  {Enter}')

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ text: 'olá' })
    await vi.waitFor(() => expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' })))
    expect(screen.getByLabelText('Mensagem')).toHaveValue('')
  })

  it('inserts a newline with Shift+Enter instead of sending', async () => {
    const fetchMock = mockApi({})
    const { user } = setup()
    await user.type(screen.getByLabelText('Mensagem'), 'linha 1{Shift>}{Enter}{/Shift}linha 2')
    expect(screen.getByLabelText('Mensagem')).toHaveValue('linha 1\nlinha 2')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks empty and over-limit messages', async () => {
    mockApi({})
    const { user } = setup()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()

    await user.click(screen.getByLabelText('Mensagem'))
    await user.paste('x'.repeat(4097))
    expect(screen.getByRole('alert')).toHaveTextContent('Limite de 4096 caracteres.')
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  })

  it('is disabled with a hint when WhatsApp is disconnected', () => {
    setup({ disabled: true })
    expect(screen.getByLabelText('Mensagem')).toBeDisabled()
    expect(screen.getByText('Conecte o WhatsApp para enviar mensagens.')).toBeInTheDocument()
  })

  it('shows the API error when sending fails', async () => {
    mockApi({ 'POST /api/conversations/c1/messages': () => ({ status: 409, body: { code: 'WHATSAPP_DISCONNECTED', message: 'O WhatsApp está desconectado.' } }) })
    const { user } = setup()
    await user.type(screen.getByLabelText('Mensagem'), 'oi{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('O WhatsApp está desconectado.')
  })

  it('keeps the draft per conversation across remounts', async () => {
    mockApi({})
    const { user, unmount } = setup()
    await user.type(screen.getByLabelText('Mensagem'), 'rascunho')
    unmount()

    setup()
    expect(screen.getByLabelText('Mensagem')).toHaveValue('rascunho')
  })

  it('attaches a file and sends it as multipart with the caption', async () => {
    const fetchMock = mockApi({ 'POST /api/conversations/c1/messages': () => ({ status: 202, body: message({ type: 'document' }) }) })
    const { user, onSent } = setup()
    const file = new File(['%PDF'], 'proposta.pdf', { type: 'application/pdf' })

    await user.upload(screen.getByLabelText('Anexar arquivo'), file)
    expect(screen.getByText('proposta.pdf')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Legenda'), 'Segue a proposta')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))

    const body = fetchMock.mock.calls[0]![1]!.body as FormData
    expect(body.get('caption')).toBe('Segue a proposta')
    expect((body.get('file') as File).name).toBe('proposta.pdf')
    await vi.waitFor(() => expect(onSent).toHaveBeenCalled())
  })

  it('rejects images over 16 MB before uploading', async () => {
    const fetchMock = mockApi({})
    const { user } = setup()
    const big = new File(['x'], 'foto.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 17 * 1024 * 1024 })

    await user.upload(screen.getByLabelText('Anexar arquivo'), big)

    expect(screen.getByRole('alert')).toHaveTextContent('Arquivo acima do limite de 16,0 MB.')
    expect(screen.queryByText('foto.png')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
