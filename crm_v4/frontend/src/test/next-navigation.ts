import { vi } from 'vitest'

export const router = { replace: vi.fn(), push: vi.fn(), back: vi.fn(), refresh: vi.fn() }
export const navigation = { searchParams: new URLSearchParams(), pathname: '/chat', params: {} as Record<string, string> }

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
  useParams: () => navigation.params,
  redirect: vi.fn(),
}))
