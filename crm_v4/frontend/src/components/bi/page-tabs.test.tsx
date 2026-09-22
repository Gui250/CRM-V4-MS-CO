import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makePage } from '@/lib/bi/test-helpers'
import { PageTabs, type PageEditing } from './page-tabs'

afterEach(() => vi.restoreAllMocks())

const pages = [makePage({ id: 'p1', name: 'Visão geral' }), makePage({ id: 'p2', name: 'Detalhes' })]

function setup(list = pages, currentPageId = 'p1') {
  const editing: PageEditing = { onAdd: vi.fn(), onRename: vi.fn(), onMove: vi.fn(), onRemove: vi.fn() }
  const onSelect = vi.fn()
  render(<PageTabs pages={list} currentPageId={currentPageId} onSelect={onSelect} editing={editing} />)
  return { editing, onSelect, user: userEvent.setup() }
}

describe('PageTabs', () => {
  it('selects a page', async () => {
    const { user, onSelect } = setup()
    expect(screen.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: 'Detalhes' }))
    expect(onSelect).toHaveBeenCalledWith('p2')
  })

  it('adds a page, up to 20', async () => {
    const { user, editing } = setup()
    await user.click(screen.getByRole('button', { name: '+ Nova página' }))
    expect(editing.onAdd).toHaveBeenCalled()
  })

  it('disables adding at 20 pages', () => {
    setup(Array.from({ length: 20 }, (_, i) => makePage({ id: `p${i}`, name: `P${i}` })), 'p0')
    expect(screen.getByRole('button', { name: '+ Nova página' })).toBeDisabled()
  })

  it('renames inline on double click', async () => {
    const { user, editing } = setup()
    await user.dblClick(screen.getByRole('tab', { name: 'Visão geral' }))
    const input = screen.getByRole('textbox', { name: 'Nome da página' })
    await user.clear(input)
    await user.type(input, 'Resumo{Enter}')
    expect(editing.onRename).toHaveBeenCalledWith('p1', 'Resumo')
  })

  it('moves the page right from the menu', async () => {
    const { user, editing } = setup()
    await user.click(screen.getByRole('button', { name: 'Opções da página Visão geral' }))
    expect(screen.getByRole('menuitem', { name: 'Mover para esquerda' })).toBeDisabled()
    await user.click(screen.getByRole('menuitem', { name: 'Mover para direita' }))
    expect(editing.onMove).toHaveBeenCalledWith('p1', 1)
  })

  it('reorders by dragging a tab onto another', () => {
    const { editing } = setup()
    const data: Record<string, string> = {}
    const dataTransfer = { types: [] as string[], setData: (t: string, v: string) => ((data[t] = v), dataTransfer.types.push(t)), getData: (t: string) => data[t] ?? '' }
    fireEvent.dragStart(screen.getByRole('tab', { name: 'Detalhes' }), { dataTransfer })
    fireEvent.drop(screen.getByRole('tab', { name: 'Visão geral' }), { dataTransfer })
    expect(editing.onMove).toHaveBeenCalledWith('p2', 0)
  })

  it('deletes only after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const { user, editing } = setup()
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('button', { name: 'Opções da página Visão geral' }))
      await user.click(screen.getByRole('menuitem', { name: 'Excluir' }))
    }
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(editing.onRemove).toHaveBeenCalledTimes(1)
    expect(editing.onRemove).toHaveBeenCalledWith('p1')
  })

  it('keeps at least one page', async () => {
    const { user } = setup([pages[0]!])
    await user.click(screen.getByRole('button', { name: 'Opções da página Visão geral' }))
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toBeDisabled()
  })

  it('shows plain tabs without editing', () => {
    render(<PageTabs pages={pages} currentPageId="p1" onSelect={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '+ Nova página' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Opções da página/ })).not.toBeInTheDocument()
  })
})
