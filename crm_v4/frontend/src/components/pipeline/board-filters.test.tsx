import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithClient } from '@/test/render'
import { BoardFilters } from './board-filters'

const mockUsers = () => mockApi({ 'GET /api/users/assignable': () => ({ body: [{ id: 'u2', name: 'Caio' }] }) })
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('BoardFilters', () => {
  it('picks my leads, unassigned or a specific user', async () => {
    mockUsers()
    const onChange = vi.fn()
    const { user } = renderWithClient(<BoardFilters value={{ assignee: '', search: '' }} onChange={onChange} />)
    await screen.findByRole('option', { name: 'Caio' }, { timeout: 5000 })
    await user.selectOptions(screen.getByLabelText('Responsável'), 'me')
    await user.selectOptions(screen.getByLabelText('Responsável'), 'none')
    await user.selectOptions(screen.getByLabelText('Responsável'), 'u2')
    expect(onChange.mock.calls.map(([value]) => value.assignee)).toEqual(['me', 'none', 'u2'])
  })

  it('debounces the search by 300 ms and clears all filters', async () => {
    mockUsers()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onChange = vi.fn()
    const { user } = renderWithClient(<BoardFilters value={{ assignee: 'me', search: '' }} onChange={onChange} />)
    await user.type(screen.getByLabelText('Buscar lead'), 'carla')
    expect(onChange).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(onChange).toHaveBeenLastCalledWith({ assignee: 'me', search: 'carla' })

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(onChange).toHaveBeenLastCalledWith({ assignee: '', search: '' })
  })
})
