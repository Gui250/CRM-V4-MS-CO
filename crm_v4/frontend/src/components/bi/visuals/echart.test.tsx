import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const chart = vi.hoisted(() => ({
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  on: vi.fn(),
}))
const init = vi.hoisted(() => vi.fn(() => chart))

vi.mock('echarts/core', () => ({ init, use: vi.fn() }))

import { EChart } from './echart'

beforeEach(() => vi.clearAllMocks())

describe('EChart', () => {
  it('inits once, sets the option and disposes on unmount', () => {
    const option = { series: [] }
    const onReady = vi.fn()
    const { unmount, rerender } = render(<EChart option={option} ariaLabel="Mensagens por atendente" onReady={onReady} />)
    expect(screen.getByRole('img', { name: 'Mensagens por atendente' })).toBeInTheDocument()
    expect(init).toHaveBeenCalledTimes(1)
    expect(chart.setOption).toHaveBeenCalledWith(option, true)
    expect(onReady).toHaveBeenCalledWith(chart)

    const next = { series: [{ type: 'bar' as const }] }
    rerender(<EChart option={next} ariaLabel="Mensagens por atendente" onReady={onReady} />)
    expect(init).toHaveBeenCalledTimes(1)
    expect(chart.setOption).toHaveBeenLastCalledWith(next, true)

    unmount()
    expect(chart.dispose).toHaveBeenCalled()
    expect(onReady).toHaveBeenLastCalledWith(null)
  })

  it('forwards clicks to the latest onItemClick', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<EChart option={{}} ariaLabel="x" onItemClick={first} />)
    rerender(<EChart option={{}} ariaLabel="x" onItemClick={second} />)
    const [event, handler] = chart.on.mock.calls[0] as unknown as [string, (p: unknown) => void]
    expect(event).toBe('click')
    handler({ dataIndex: 2 })
    expect(second).toHaveBeenCalledWith({ dataIndex: 2 })
    expect(first).not.toHaveBeenCalled()
  })
})
