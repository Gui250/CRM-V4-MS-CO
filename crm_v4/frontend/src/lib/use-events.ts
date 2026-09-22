'use client'

import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { reportError } from './logger'
import { bumpConversation, messagesKey, replaceConversation, upsertMessage } from './chat-cache'
import {
  applyUnreadEverywhere,
  deleteLeadEverywhere,
  upsertLeadEverywhere,
  type LeadDeletedEvent,
  type LeadSnapshot,
} from './pipeline-cache'
import { isRunActive, type RunSummary } from './automation-types'
import { automationKeys } from './use-automation'
import { connectionQueryKey } from './use-connection'
import type { Connection, Conversation, Lead, Message } from './types'

type Handlers = Record<string, (client: QueryClient, data: unknown) => void>

export const eventHandlers: Handlers = {
  'connection.updated': (client, data) => {
    client.setQueryData(connectionQueryKey, (data as { connection: Connection }).connection)
  },
  'message.created': (client, data) => {
    const { message, conversation } = data as { message: Message; conversation: Conversation }
    upsertMessage(client, message)
    bumpConversation(client, conversation)
    applyUnreadEverywhere(client, conversation.id, conversation.unreadCount)
  },
  'message.updated': (client, data) => {
    const { message } = data as { message: Message }
    const cached = client.getQueryData(messagesKey(message.conversationId))
    if (cached) upsertMessage(client, message)
  },
  'conversation.updated': (client, data) => {
    const { conversation } = data as { conversation: Conversation }
    replaceConversation(client, conversation)
    applyUnreadEverywhere(client, conversation.id, conversation.unreadCount)
  },
  'lead.upserted': (client, data) => {
    const { lead, previous } = data as { lead: Lead; previous: LeadSnapshot | null }
    upsertLeadEverywhere(client, lead, previous)
    void client.invalidateQueries({ queryKey: ['lead', lead.id] })
  },
  'lead.deleted': (client, data) => {
    deleteLeadEverywhere(client, data as LeadDeletedEvent & { contactId: string })
  },
  'run.updated': (client, data) => {
    const { run } = data as { run: RunSummary }
    // The chat's "automação em andamento" reads this list; active run first (contracts/sse-events.md).
    client.setQueryData<RunSummary[]>(automationKeys.conversationRuns(run.conversationId), (runs) =>
      runs
        ? [run, ...runs.filter((r) => r.id !== run.id)].sort((a, b) => Number(isRunActive(b)) - Number(isRunActive(a)))
        : runs,
    )
    void client.invalidateQueries({ queryKey: ['runs', run.flowId] })
    void client.invalidateQueries({ queryKey: automationKeys.run(run.id) })
  },
  'pipeline.changed': (client, data) => {
    const { pipelineId } = data as { pipelineId: string }
    void client.invalidateQueries({ queryKey: ['pipelines'] })
    void client.invalidateQueries({ queryKey: ['board', pipelineId] })
  },
}

/** Refetch what may have been missed while the stream was down (SSE has no replay). */
export function invalidateLiveData(client: QueryClient) {
  for (const key of [connectionQueryKey, ['conversations'], ['messages'], ['pipelines'], ['board'], ['leads']]) {
    void client.invalidateQueries({ queryKey: key })
  }
}

/** One EventSource per panel; mount once in the panel layout. */
export function useEvents() {
  const client = useQueryClient()
  useEffect(() => {
    const source = new EventSource('/api/events')
    let hadError = false

    for (const [name, handle] of Object.entries(eventHandlers)) {
      source.addEventListener(name, (event) => {
        try {
          handle(client, JSON.parse((event as MessageEvent<string>).data))
        } catch (error) {
          reportError(error, `event ${name}`)
        }
      })
    }
    source.onopen = () => {
      if (hadError) invalidateLiveData(client)
      hadError = false
    }
    source.onerror = () => {
      hadError = true
    }
    return () => source.close()
  }, [client])
}
