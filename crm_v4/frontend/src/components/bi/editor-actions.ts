import { currentPage, editorReducer, type EditorAction, type EditorState } from '@/lib/bi/editor-reducer'
import type { ReportPage, Visual } from '@/lib/bi/types'

/**
 * Editor actions plus two undoable edits of the current page that keep the selection:
 * `updatePage` (e.g. page filters) and `replaceVisual` (a field dropped on a visual may change its type).
 */
export type BiEditorAction = EditorAction | { type: 'updatePage'; page: ReportPage } | { type: 'replaceVisual'; visual: Visual }

export function biEditorReducer(state: EditorState, action: BiEditorAction): EditorState {
  if (action.type === 'replaceVisual') {
    const page = currentPage(state)
    const { visual } = action
    return biEditorReducer(state, { type: 'updatePage', page: { ...page, visuals: page.visuals.map((v) => (v.id === visual.id ? visual : v)) } })
  }
  if (action.type !== 'updatePage') return editorReducer(state, action)
  if (action.page === currentPage(state)) return state
  const next = editorReducer(state, { type: 'replacePage', page: action.page })
  const stillThere = action.page.visuals.some((v) => v.id === state.selectedVisualId)
  return { ...next, selectedVisualId: stillThere ? state.selectedVisualId : null }
}
