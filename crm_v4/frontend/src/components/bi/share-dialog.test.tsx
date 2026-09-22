import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithClient } from '@/test/render'
import { ShareDialog } from './share-dialog'
import { bodiesOf } from './test-utils'

afterEach(() => vi.unstubAllGlobals())

function setup() {
  const fetchMock = mockApi({
    'GET /api/bi/reports/r1/shares': () => ({ body: [{ userId: 'u2', userName: 'Bia', permission: 'view' }] }),
    'GET /api/users/assignable': () => ({ body: [{ id: 'u1', name: 'Ana' }, { id: 'u2', name: 'Bia' }, { id: 'u3', name: 'Caio' }] }),
    'PUT /api/bi/reports/r1/shares': (init) => ({ body: JSON.parse(String(init?.body)) }),
  })
  const onClose = vi.fn()
  const utils = renderWithClient(<ShareDialog reportId="r1" currentUserId="u1" onClose={onClose} />)
  return { fetchMock, onClose, ...utils }
}

describe('ShareDialog', () => {
  it('lists current shares and offers only other active users', async () => {
    setup()
    const list = screen.getByRole('list', { name: 'Pessoas com acesso' })
    expect(await within(list).findByText('Bia')).toBeInTheDocument()
    const picker = screen.getByRole('combobox', { name: 'Pessoa' })
    await within(picker).findByRole('option', { name: 'Caio' })
    expect(within(picker).queryByRole('option', { name: 'Ana' })).not.toBeInTheDocument()
    expect(within(picker).queryByRole('option', { name: 'Bia' })).not.toBeInTheDocument()
  })

  it('adds, changes and removes people, then saves the whole list', async () => {
    const { user, fetchMock, onClose } = setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Pessoa' }), await screen.findByRole('option', { name: 'Caio' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Permissão da nova pessoa' }), 'Editar')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Permissão de Bia' }), 'Editar')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(bodiesOf(fetchMock, 'PUT /api/bi/reports/r1/shares')).toEqual([
      [
        { userId: 'u2', permission: 'edit' },
        { userId: 'u3', permission: 'edit' },
      ],
    ])
  })

  it('revokes access', async () => {
    const { user, fetchMock } = setup()
    await user.click(await screen.findByRole('button', { name: 'Remover Bia' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(bodiesOf(fetchMock, 'PUT /api/bi/reports/r1/shares')).toEqual([[]]))
  })
})
