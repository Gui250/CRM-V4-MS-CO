'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError, apiFetch } from '@/lib/api'
import { formatCell } from '@/lib/bi/format'
import type { Column, QueryRequest } from '@/lib/bi/types'
import { ModalDialog } from './modal-dialog'

export const ROWS_PAGE_SIZE = 100

type RowsResult = { columns: Column[]; rows: unknown[][]; total: number }

async function downloadCsv(body: object, fileName: string) {
  const response = await fetch('/api/bi/rows.csv', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`CSV ${response.status}`)
  const url = URL.createObjectURL(await response.blob())
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** "Ver dados" (FR-020): the rows behind a visual, 100 per page, with CSV download. */
export function DataRowsDialog({ title, request, onClose }: { title: string; request: QueryRequest; onClose: () => void }) {
  const [page, setPage] = useState(1)
  const [downloadError, setDownloadError] = useState(false)
  const body = { sourceId: request.sourceId, filters: request.filters, calculatedFields: request.calculatedFields }
  const rows = useQuery({
    queryKey: ['bi-rows', body, page],
    queryFn: () => apiFetch<RowsResult>('/api/bi/rows', { method: 'POST', json: { ...body, page } }),
    placeholderData: keepPreviousData,
  })
  const total = rows.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / ROWS_PAGE_SIZE))

  return (
    <ModalDialog title={`Dados: ${title}`} onClose={onClose} className="max-w-5xl">
      <div className="flex flex-col gap-3">
        {rows.isError && (
          <p role="alert" className="text-sm text-brand">
            {rows.error instanceof ApiError ? rows.error.message : 'Não foi possível carregar as linhas.'}
          </p>
        )}
        <div className="max-h-[60vh] overflow-auto border border-line">
          <table className="w-full border-collapse text-sm tabular-nums">
            <caption className="sr-only">Linhas de {title}</caption>
            <thead className="sticky top-0 bg-mist">
              <tr>
                {rows.data?.columns.map((c) => (
                  <th key={c.key} scope="col" className="px-2 py-1.5 text-left font-mono text-[11px] font-bold uppercase whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.data?.rows.map((row, r) => (
                <tr key={r} className="border-t border-line">
                  {row.map((cell, i) => (
                    <td key={i} className="px-2 py-1 whitespace-nowrap">
                      {formatCell(cell, rows.data.columns[i]?.type ?? 'text')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Button variant="secondary" className="h-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span className="font-mono text-xs">
              Página {page} de {pages} · {total} linhas
            </span>
            <Button variant="secondary" className="h-8" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Próxima
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
            <Button onClick={() => downloadCsv(body, `${title}.csv`).then(() => setDownloadError(false), () => setDownloadError(true))}>Baixar planilha</Button>
          </div>
        </div>
        {downloadError && (
          <p role="alert" className="text-sm text-brand">
            Não foi possível baixar a planilha.
          </p>
        )}
      </div>
    </ModalDialog>
  )
}
