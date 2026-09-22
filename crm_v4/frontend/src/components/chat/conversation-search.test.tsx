import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationSearch } from './conversation-search'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('ConversationSearch', () => {
  it('debounces the search term by 300 ms', () => {
    const onChange = vi.fn()
    render(<ConversationSearch value={{ search: '', unread: false }} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Buscar conversa'), { target: { value: ' ana ' } })
    act(() => vi.advanceTimersByTime(299))
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onChange).toHaveBeenCalledWith({ search: 'ana', unread: false })
  })

  it('toggles the unread filter immediately', () => {
    const onChange = vi.fn()
    render(<ConversationSearch value={{ search: 'x', unread: false }} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Só não lidas'))
    expect(onChange).toHaveBeenCalledWith({ search: 'x', unread: true })
  })
})
