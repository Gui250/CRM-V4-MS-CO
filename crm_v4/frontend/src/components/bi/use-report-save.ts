'use client'

import { useState } from 'react'
import { ApiError } from '@/lib/api'
import type { EditorState } from '@/lib/bi/editor-reducer'
import { formatCell } from '@/lib/bi/format'
import type { Report } from '@/lib/bi/types'
import { isReportConflict, useReport, useSaveReport } from '@/lib/bi/use-bi'
import type { BiEditorAction } from './editor-actions'

export type Conflict = { savedBy: string; savedAt: string }

type ConflictDetails = { updatedAt?: string; updatedByName?: string }

/** `ApiError` carries the 409 `details`; fall back to the refetched report. */
function conflictFrom(error: unknown, latest: Report | undefined): Conflict {
  const details = (error as { details?: ConflictDetails }).details ?? {}
  const savedAt = details.updatedAt ?? latest?.updatedAt ?? new Date().toISOString()
  return { savedBy: details.updatedByName ?? latest?.ownerName ?? 'Outra pessoa', savedAt: formatCell(savedAt, 'datetime').slice(-5) }
}

/** Save with optimistic concurrency (FR-036): a 409 becomes a conflict to reload or overwrite. */
export function useReportSave(reportId: string, state: EditorState, dispatch: (action: BiEditorAction) => void) {
  const save = useSaveReport()
  const latest = useReport(reportId)
  const [conflict, setConflict] = useState<Conflict | null>(null)

  function run(force = false) {
    const { definition, name } = state
    const version = force ? (latest.data?.version ?? state.savedVersion) : state.savedVersion
    save.mutate(
      { id: reportId, name, definition, version, ...(force ? { force: true } : {}) },
      {
        onSuccess: (report) => {
          setConflict(null)
          dispatch({ type: 'markSaved', version: report.version, definition, name })
        },
        onError: async (error) => {
          if (!isReportConflict(error)) return
          const fresh = await latest.refetch()
          setConflict(conflictFrom(error, fresh.data))
        },
      },
    )
  }

  function reload() {
    if (latest.data) dispatch({ type: 'load', report: latest.data })
    setConflict(null)
  }

  const error = save.isError && !isReportConflict(save.error) ? (save.error instanceof ApiError ? save.error.message : 'Não foi possível salvar.') : null
  return { save: () => run(false), overwrite: () => run(true), reload, conflict, error, isSaving: save.isPending }
}
