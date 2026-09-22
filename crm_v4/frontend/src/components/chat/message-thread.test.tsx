import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { upsertMessage } from '@/lib/chat-cache'
import { message, page } from '@/test/fixtures'
import { mockApi, renderWithClient } from '@/test/render'
import { MessageThread } from './message-thread'

afterEach(() => vi.unstubAllGlobals())

const day = (offset: number, hour: number) => {
  const date = new Date()
  date.setDate(date.getDate() - offset)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

/** jsdom has no layout; give the scroller controllable geometry. */
function fakeGeometry(el: HTMLElement, initialHeight: number) {
  const box = { height: initialHeight, top: 0 }
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => box.height })
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 400 })
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => box.top, set: (v: number) => (box.top = v) })
  return box
}

describe('MessageThread', () => {
  it('shows messages oldest to newest with day separators', async () => {
    mockApi({
      'GET /api/conversations/c1/messages': () => ({
        body: page([message({ id: 'm3', body: 'hoje', sentAt: day(0, 10) }), message({ id: 'm2', body: 'ontem', sentAt: day(1, 10) })]),
      }),
    })
    renderWithClient(<MessageThread conversationId="c1" />)

    expect(await screen.findByText('hoje')).toBeInTheDocument()
    const rows = [...screen.getByRole('list', { name: 'Mensagens' }).children].map((li) => li.textContent ?? '')
    expect(rows).toEqual(['Ontem', expect.stringMatching(/^ontem/), 'Hoje', expect.stringMatching(/^hoje/)])
  })

  it('loads older messages at the top and keeps the reader on the same message', async () => {
    const fetchMock = mockApi({
      'GET /api/conversations/c1/messages': (_init, url) =>
        url.searchParams.get('cursor')
          ? { body: page([message({ id: 'm1', body: 'mais antiga', sentAt: day(0, 8) })]) }
          : { body: page([message({ id: 'm2', body: 'recente', sentAt: day(0, 9) })], 'cursor-1') },
    })
    renderWithClient(<MessageThread conversationId="c1" />)
    await screen.findByText('recente')
    const box = fakeGeometry(screen.getByTestId('thread'), 1000)

    box.top = 10
    fireEvent.scroll(screen.getByTestId('thread'))
    box.height = 1600

    expect(await screen.findByText('mais antiga')).toBeInTheDocument()
    expect(new URL(String(fetchMock.mock.calls.at(-1)![0]), 'http://x').searchParams.get('cursor')).toBe('cursor-1')
    expect(box.top).toBe(610)
  })

  it('follows new messages only when the reader is near the bottom', async () => {
    mockApi({ 'GET /api/conversations/c1/messages': () => ({ body: page([message({ id: 'm1', sentAt: day(0, 9) })]) }) })
    const { client } = renderWithClient(<MessageThread conversationId="c1" />)
    await screen.findByText('oi')
    const thread = screen.getByTestId('thread')
    const box = fakeGeometry(thread, 2000)

    box.top = 300 // reading older messages, far from the bottom
    fireEvent.scroll(thread)
    act(() => upsertMessage(client, message({ id: 'm2', body: 'nova 1', sentAt: day(0, 10) })))
    expect(await screen.findByText('nova 1')).toBeInTheDocument()
    expect(box.top).toBe(300)

    box.top = 1600 // at the bottom (2000 - 400)
    fireEvent.scroll(thread)
    act(() => upsertMessage(client, message({ id: 'm3', body: 'nova 2', sentAt: day(0, 11) })))
    expect(await screen.findByText('nova 2')).toBeInTheDocument()
    expect(box.top).toBe(2000)
  })
})
