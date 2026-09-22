import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithClient } from '@/test/render'
import { OfflineBanner } from './offline-banner'

describe('OfflineBanner', () => {
  it('appears when offline and refetches live data when back online', () => {
    const { client } = renderWithClient(<OfflineBanner />)
    const spy = vi.spyOn(client, 'invalidateQueries')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão com a internet.')

    onLine.mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith({ queryKey: ['messages'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['conversations'] })
  })
})
