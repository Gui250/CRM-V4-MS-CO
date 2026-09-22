import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VisualFrame } from './visual-frame'

describe('VisualFrame', () => {
  it('shows a loading skeleton', () => {
    render(<VisualFrame title="Mensagens" menuItems={[]} state={{ status: 'loading' }} />)
    expect(screen.getByLabelText('Carregando componente')).toHaveAttribute('aria-busy', 'true')
  })

  it('shows the error message', () => {
    render(<VisualFrame title="Mensagens" menuItems={[]} state={{ status: 'error', errorMessage: 'Fonte fora do ar.' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Fonte fora do ar.')
  })

  it('asks for fields when the visual is not ready', () => {
    render(<VisualFrame title="Colunas" menuItems={[]} state={{ status: 'notReady' }} />)
    expect(screen.getByText('Arraste campos para montar o componente')).toBeInTheDocument()
  })

  it('says there is no data for the current filters', () => {
    render(<VisualFrame title="Colunas" menuItems={[]} state={{ status: 'empty' }} />)
    expect(screen.getByText('Sem dados para os filtros atuais')).toBeInTheDocument()
  })

  it('renders the visual when ready', () => {
    render(
      <VisualFrame title="Colunas" menuItems={[]} state={{ status: 'ready' }}>
        <p>gráfico</p>
      </VisualFrame>,
    )
    expect(screen.getByRole('region', { name: 'Colunas' })).toHaveTextContent('gráfico')
  })

  it('warns about each field missing from the source', () => {
    render(<VisualFrame title="Colunas" menuItems={[]} state={{ status: 'ready', missingFields: ['vendedor', 'regiao'] }} />)
    expect(screen.getByText('O campo vendedor não existe mais na fonte')).toBeInTheDocument()
    expect(screen.getByText('O campo regiao não existe mais na fonte')).toBeInTheDocument()
  })

  it('notes rows ignored for invalid values', () => {
    render(<VisualFrame title="Colunas" menuItems={[]} state={{ status: 'ready', ignoredRows: 4 }} />)
    expect(screen.getByText('4 linhas ignoradas por valores inválidos')).toBeInTheDocument()
  })

  it('shows the stale warning and the snapshot date of external sources', () => {
    render(<VisualFrame title="Vendas" menuItems={[]} state={{ status: 'ready', staleWarning: 'dados de 20/09/2026; última atualização falhou', dataAsOf: '2026-09-20T13:05:00.000Z' }} />)
    expect(screen.getByText('dados de 20/09/2026; última atualização falhou')).toBeInTheDocument()
    expect(screen.getByText('Dados de 20/09/2026 10:05')).toBeInTheDocument()
  })

  it('flags fields left out after a type change', () => {
    render(<VisualFrame title="Pizza" menuItems={[]} state={{ status: 'ready', pendingFields: ['Soma de Valor', 'Status'] }} />)
    expect(screen.getByText('Campos não usados: Soma de Valor, Status')).toBeInTheDocument()
  })

  it('runs menu actions', async () => {
    const onSelect = vi.fn()
    render(<VisualFrame title="Colunas" menuItems={[{ label: 'Ver dados', onSelect }]} state={{ status: 'ready' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Opções de Colunas' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ver dados' }))
    expect(onSelect).toHaveBeenCalled()
  })
})
