'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'
import type { Connection } from './types'

export const connectionQueryKey = ['connection'] as const

export function useConnection() {
  return useQuery({ queryKey: connectionQueryKey, queryFn: () => apiFetch<Connection>('/api/connection') })
}
