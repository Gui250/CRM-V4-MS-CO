import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { conversation, infinite, page } from '@/test/fixtures'
import { conversationsKey, replaceConversation } from './chat-cache'

const awaiting = { search: '', unread: false, awaitingHuman: true }
const human = (assumedBy: { id: string; name: string } | null) => ({
  mode: 'human' as const,
  reason: 'Pediu uma pessoa',
  summary: null,
  handoffAt: '2026-09-22T12:00:00.000Z',
  assumedBy,
})

describe('replaceConversation and "Aguardando humano" lists', () => {
  it('drops a conversation from the awaiting list once someone assumes it', () => {
    const client = new QueryClient()
    client.setQueryData(conversationsKey(awaiting), infinite(page([conversation({ id: 'c1', handling: human(null) })])))
    replaceConversation(client, conversation({ id: 'c1', handling: human({ id: 'u1', name: 'Bia' }) }))
    expect(client.getQueryData<{ pages: { items: unknown[] }[] }>(conversationsKey(awaiting))?.pages[0]?.items).toEqual([])
  })

  it('refetches the awaiting list when a conversation newly qualifies', () => {
    const client = new QueryClient()
    client.setQueryData(conversationsKey(awaiting), infinite(page([])))
    const spy = vi.spyOn(client, 'invalidateQueries')
    replaceConversation(client, conversation({ id: 'c9', handling: human(null) }))
    expect(spy).toHaveBeenCalledWith({ queryKey: conversationsKey(awaiting), exact: true })
  })

  it('leaves unfiltered lists alone apart from replacing the item', () => {
    const client = new QueryClient()
    const all = { search: '', unread: false }
    client.setQueryData(conversationsKey(all), infinite(page([conversation({ id: 'c1' })])))
    replaceConversation(client, conversation({ id: 'c1', handling: human({ id: 'u1', name: 'Bia' }) }))
    const items = client.getQueryData<{ pages: { items: { handling: unknown }[] }[] }>(conversationsKey(all))?.pages[0]?.items
    expect(items?.[0]?.handling).toMatchObject({ mode: 'human' })
  })
})
