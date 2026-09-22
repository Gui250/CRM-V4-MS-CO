import type { Conflict } from './use-report-save'

/** Someone saved first (FR-036): reload their version or overwrite it with ours. */
export function ConflictBanner({ conflict, onReload, onOverwrite }: { conflict: Conflict; onReload: () => void; onOverwrite: () => void }) {
  return (
    <div role="alert" className="bi-no-print flex flex-wrap items-center gap-3 bg-ink px-4 py-2 text-sm text-white">
      <span className="h-5 w-1 bg-brand" aria-hidden />
      <p className="min-w-0 flex-1">
        <strong>
          {conflict.savedBy} salvou às {conflict.savedAt}
        </strong>
        . Suas alterações ainda não foram salvas.
      </p>
      <button type="button" onClick={onReload} className="border border-white/70 px-3 py-1 font-semibold hover:bg-white hover:text-ink">
        Recarregar
      </button>
      <button type="button" onClick={onOverwrite} className="bg-brand px-3 py-1 font-semibold hover:bg-brand-dark">
        Sobrescrever
      </button>
    </div>
  )
}
