import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Pipeline } from '@/lib/types'
import { stage } from '@/test/fixtures'
import { mockApi, renderWithClient } from '@/test/render'
import { StageEditor } from './stage-editor'

afterEach(() => vi.unstubAllGlobals())

const pipeline: Pipeline = {
  id: 'p1',
  name: 'Vendas',
  isEntry: true,
  archivedAt: null,
  stages: [
    stage({ id: 's1', name: 'Novo' }),
    stage({ id: 's2', name: 'Em contato', position: 1, color: 'blue' }),
    stage({ id: 's3', name: 'Perdido', position: 2, kind: 'lost', color: 'red' }),
  ],
}

function setup(routes: Parameters<typeof mockApi>[0] = {}) {
  const calls: { key: string; url: string; body: unknown }[] = []
  mockApi(
    Object.fromEntries(
      Object.entries(routes).map(([key, handler]) => [
        key,
        (init: RequestInit | undefined, url: URL) => {
          calls.push({ key, url: url.pathname + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined })
          return handler(init, url)
        },
      ]),
    ),
  )
  return { calls, ...renderWithClient(<StageEditor pipeline={pipeline} />) }
}

const rows = () => within(screen.getByRole('list', { name: 'Etapas do funil' })).getAllByRole('listitem')

describe('StageEditor', () => {
  it('lists stages in order with name, kind and color', () => {
    setup()
    expect(rows()).toHaveLength(3)
    expect(screen.getByLabelText('Nome da etapa Novo')).toHaveValue('Novo')
    expect(screen.getByLabelText('Tipo da etapa Perdido')).toHaveValue('lost')
    expect(within(screen.getByRole('group', { name: 'Cor da etapa Em contato' })).getByLabelText('Azul')).toBeChecked()
  })

  it('adds, renames, recolors and changes the kind of a stage', async () => {
    const { user, calls } = setup({
      'POST /api/pipelines/p1/stages': () => ({ status: 201, body: stage({ id: 's9', name: 'Onboarding' }) }),
      'PATCH /api/pipelines/p1/stages/s1': () => ({ body: stage() }),
    })
    await user.type(screen.getByLabelText('Nova etapa'), ' Onboarding ')
    await user.click(screen.getByRole('button', { name: 'Adicionar etapa' }))
    await waitFor(() => expect(calls[0]).toMatchObject({ key: 'POST /api/pipelines/p1/stages', body: { name: 'Onboarding' } }))
    await waitFor(() => expect(screen.getByLabelText('Nova etapa')).toHaveValue(''))

    const nameField = screen.getByLabelText('Nome da etapa Novo')
    await user.clear(nameField)
    await user.type(nameField, 'Entrada{Enter}')
    await user.click(within(screen.getByRole('group', { name: 'Cor da etapa Novo' })).getByLabelText('Verde'))
    await user.selectOptions(screen.getByLabelText('Tipo da etapa Novo'), 'won')
    await waitFor(() => expect(calls.slice(1).map((c) => c.body)).toEqual([{ name: 'Entrada' }, { color: 'green' }, { kind: 'won' }]))
  })

  it('reorders with Alt + arrow keys, sending the full order', async () => {
    const { user, calls } = setup({ 'PUT /api/pipelines/p1/stages/order': () => ({ body: [] }) })
    screen.getByRole('button', { name: /Reordenar Perdido/ }).focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    await waitFor(() => expect(calls[0]?.body).toEqual({ stageIds: ['s1', 's3', 's2'] }))
    expect(await screen.findByText('Perdido agora é a etapa 2 de 3.')).toBeInTheDocument()
  })

  it('confirms before deleting, and asks for a destination when the stage has leads', async () => {
    let attempt = 0
    const { user, calls } = setup({
      'DELETE /api/pipelines/p1/stages/s1': () =>
        ++attempt === 1 ? { status: 409, body: { code: 'STAGE_NOT_EMPTY', message: 'Escolha para qual etapa…' } } : { status: 204 },
    })
    await user.click(within(rows()[0]!).getByRole('button', { name: 'Excluir' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))

    const destination = await screen.findByLabelText('Esta etapa tem leads. Mover para')
    expect(within(destination).getAllByRole('option').map((o) => o.textContent)).toEqual(['Em contato', 'Perdido'])
    await user.selectOptions(destination, 's3')
    await user.click(screen.getByRole('button', { name: 'Mover leads e excluir' }))
    await waitFor(() => expect(calls[1]?.url).toBe('/api/pipelines/p1/stages/s1?moveToStageId=s3'))
  })

  it('shows server errors in pt-BR', async () => {
    const { user } = setup({
      'POST /api/pipelines/p1/stages': () => ({ status: 409, body: { code: 'STAGE_NAME_TAKEN', message: 'Já existe uma etapa com esse nome neste funil.' } }),
    })
    await user.type(screen.getByLabelText('Nova etapa'), 'Novo')
    await user.click(screen.getByRole('button', { name: 'Adicionar etapa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma etapa com esse nome neste funil.')
  })
})
