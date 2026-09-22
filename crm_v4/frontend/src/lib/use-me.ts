'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'
import type { User } from './types'

export const meQueryKey = ['me'] as const

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: () => apiFetch<User>('/api/auth/me') })
}
