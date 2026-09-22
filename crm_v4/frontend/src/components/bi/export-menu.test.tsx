import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportHeader } from './export-header'
import { ExportMenu } from './export-menu'

const toPng = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,AAA'))
vi.mock('html-to-image', () => ({ toPng }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-22T15:00:00.000Z'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function Page({ onBeforeExport = vi.fn() }: { onBeforeExport?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      <ExportMenu targetRef={ref} reportName="Atendimento" pageName="Visão geral" onBeforeExport={onBeforeExport} />
      <div ref={ref} data-testid="page">
        <ExportHeader reportName="Atendimento" pageName="Visão geral" filters={['Atendente: Ana']} generatedAt={new Date()} />
      </div>
    </>
  )
}

describe('ExportMenu', () => {
  it('downloads the page as PNG named after report, page and date', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const onBeforeExport = vi.fn()
    render(<Page onBeforeExport={onBeforeExport} />)
    await userEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Imagem (PNG)' }))
    await vi.waitFor(() => expect(click).toHaveBeenCalled())
    expect(onBeforeExport).toHaveBeenCalled()
    expect(toPng).toHaveBeenCalledWith(screen.getByTestId('page'), expect.anything())
    const link = click.mock.contexts[0] as HTMLAnchorElement
    expect(link.download).toBe('Atendimento - Visão geral - 2026-09-22.png')
    expect(link.href).toBe('data:image/png;base64,AAA')
    expect(screen.getByTestId('page')).not.toHaveClass('bi-exporting')
  })

  it('prints for PDF', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    render(<Page />)
    await userEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'PDF' }))
    expect(print).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('reports a failed image export', async () => {
    toPng.mockRejectedValueOnce(new Error('canvas tainted'))
    render(<Page />)
    await userEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Imagem (PNG)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível gerar a imagem.')
  })
})

describe('ExportHeader', () => {
  it('carries report, page, active filters and generation time', () => {
    render(<ExportHeader reportName="Atendimento" pageName="Visão geral" filters={['Atendente: Ana', 'Enviada em: 01/09/2026 a 10/09/2026']} generatedAt={new Date('2026-09-22T15:04:00.000Z')} />)
    expect(screen.getByText('Filtros: Atendente: Ana · Enviada em: 01/09/2026 a 10/09/2026')).toBeInTheDocument()
    expect(screen.getByText('Gerado em 22/09/2026 12:04')).toBeInTheDocument()
    expect(screen.getByText('Atendimento').closest('.bi-export-header')).toHaveClass('hidden')
  })
})
