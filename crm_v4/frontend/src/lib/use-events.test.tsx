import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeEventSource } from '@/test/fake-event-source'
import { useEvents } from './use-events'

let client: QueryClient

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  client = new QueryClient()
})
afterEach(() => vi.unstubAllGlobals())

const mount = () =>
  renderHook(() => useEvents(), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  })

describe('useEvents', () => {
  it('opens one stream and closes it on unmount', () => {
    const { unmount } = mount()
    expect(FakeEventSource.latest().url).toBe('/api/events')
    unmount()
    expect(FakeEventSource.latest().closed).toBe(true)
  })

  it('writes connection.updated into the connection query', () => {
    mount()
    const connection = { status: 'connected', phoneNumber: '55', qrCode: null, lastConnectedAt: null }
    FakeEventSource.latest().emit('connection.updated', { connection })
    expect(client.getQueryData(['connection'])).toEqual(connection)
  })

  it('invalidates live data when the stream reconnects after an error', () => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    mount()
    const source = FakeEventSource.latest()

    source.onopen?.()
    expect(spy).not.toHaveBeenCalled()

    source.onerror?.()
    source.onopen?.()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['connection'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['conversations'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['messages'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['board'] })
  })
})

describe('useEvents: chat events', () => {
  const unfiltered = ['conversations', { search: '', unread: false }]

  it('message.created prepends the message and moves its conversation to the top', async () => {
    const { conversation, message, infinite, page } = await import('@/test/fixtures')
    client.setQueryData(['messages', 'c2'], infinite(page([message({ id: 'old', conversationId: 'c2' })])))
    client.setQueryData(unfiltered, infinite(page([conversation({ id: 'c1' }), conversation({ id: 'c2' })])))
    mount()

    const updated = conversation({ id: 'c2', unreadCount: 1, lastMessagePreview: 'nova' })
    FakeEventSource.latest().emit('message.created', { message: message({ id: 'new', conversationId: 'c2' }), conversation: updated })

    const messages = client.getQueryData<ReturnType<typeof infinite>>(['messages', 'c2'])!
    expect(messages.pages[0]!.items.map((m) => (m as { id: string }).id)).toEqual(['new', 'old'])
    const list = client.getQueryData<ReturnType<typeof infinite>>(unfiltered)!
    expect(list.pages[0]!.items.map((c) => (c as { id: string }).id)).toEqual(['c2', 'c1'])
  })

  it('message.created does not duplicate a message already in cache', async () => {
    const { message, infinite, page } = await import('@/test/fixtures')
    client.setQueryData(['messages', 'c1'], infinite(page([message({ id: 'm1' })])))
    mount()
    FakeEventSource.latest().emit('message.created', { message: message({ id: 'm1', body: 'editada' }), conversation: {} })
    const messages = client.getQueryData<ReturnType<typeof infinite>>(['messages', 'c1'])!
    expect(messages.pages[0]!.items).toHaveLength(1)
  })

  it('message.updated replaces the message in place', async () => {
    const { message, infinite, page } = await import('@/test/fixtures')
    client.setQueryData(['messages', 'c1'], infinite(page([message({ id: 'm2' }), message({ id: 'm1', status: 'sent', direction: 'outbound' })])))
    mount()
    FakeEventSource.latest().emit('message.updated', { message: message({ id: 'm1', status: 'read', direction: 'outbound' }) })
    const messages = client.getQueryData<ReturnType<typeof infinite>>(['messages', 'c1'])!
    expect(messages.pages[0]!.items.map((m) => (m as { status: string | null }).status)).toEqual([null, 'read'])
  })

  it('conversation.updated replaces the conversation without reordering', async () => {
    const { conversation, infinite, page } = await import('@/test/fixtures')
    client.setQueryData(unfiltered, infinite(page([conversation({ id: 'c1' }), conversation({ id: 'c2', unreadCount: 4 })])))
    mount()
    FakeEventSource.latest().emit('conversation.updated', { conversation: conversation({ id: 'c2', unreadCount: 0 }) })
    const list = client.getQueryData<ReturnType<typeof infinite>>(unfiltered)!
    expect(list.pages[0]!.items.map((c) => (c as { unreadCount: number }).unreadCount)).toEqual([0, 0])
    expect(list.pages[0]!.items.map((c) => (c as { id: string }).id)).toEqual(['c1', 'c2'])
  })

  it('refetches filtered lists instead of guessing whether the conversation matches', async () => {
    const { conversation, message, infinite, page } = await import('@/test/fixtures')
    const filtered = ['conversations', { search: 'ana', unread: false }]
    client.setQueryData(filtered, infinite(page([conversation({ id: 'c1' })])))
    const spy = vi.spyOn(client, 'invalidateQueries')
    mount()
    FakeEventSource.latest().emit('message.created', { message: message({ conversationId: 'c9' }), conversation: conversation({ id: 'c9' }) })
    expect(spy).toHaveBeenCalledWith({ queryKey: filtered, exact: true })
  })
})

describe('useEvents: pipeline events', () => {
  const key = ['board', 'p1', { assignee: '', search: '' }]

  it('lead.upserted moves the card on every cached board and in the contact leads', async () => {
    const { board, boardStage, lead } = await import('@/test/fixtures')
    client.setQueryData(key, board([boardStage({ id: 's1', leads: [lead()] }), boardStage({ id: 's2', position: 1 })]))
    client.setQueryData(['leads', 'contact', 'ct1'], [lead()])
    mount()

    const moved = lead({ stageId: 's2' })
    FakeEventSource.latest().emit('lead.upserted', { lead: moved, previous: { stageId: 's1', valueCents: null } })

    const cached = client.getQueryData<ReturnType<typeof board>>(key)!
    expect(cached.stages.map((s) => s.leads.map((l) => l.id))).toEqual([[], ['l1']])
    expect(client.getQueryData(['leads', 'contact', 'ct1'])).toEqual([moved])
  })

  it('lead.deleted removes the card; pipeline.changed refetches pipelines and that board', async () => {
    const { board, boardStage, lead } = await import('@/test/fixtures')
    client.setQueryData(key, board([boardStage({ id: 's1', leads: [lead()] })]))
    const spy = vi.spyOn(client, 'invalidateQueries')
    mount()

    FakeEventSource.latest().emit('lead.deleted', { leadId: 'l1', pipelineId: 'p1', stageId: 's1', contactId: 'ct1', valueCents: null })
    expect(client.getQueryData<ReturnType<typeof board>>(key)!.stages[0]!.leads).toEqual([])

    FakeEventSource.latest().emit('pipeline.changed', { pipelineId: 'p1' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['pipelines'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['board', 'p1'] })
  })

  it('conversation unread counts reach the lead cards', async () => {
    const { board, boardStage, conversation, lead, message } = await import('@/test/fixtures')
    client.setQueryData(key, board([boardStage({ id: 's1', leads: [lead({ conversationId: 'c1' })] })]))
    mount()
    FakeEventSource.latest().emit('message.created', { message: message(), conversation: conversation({ id: 'c1', unreadCount: 3 }) })
    expect(client.getQueryData<ReturnType<typeof board>>(key)!.stages[0]!.leads[0]!.unreadCount).toBe(3)
  })
})
