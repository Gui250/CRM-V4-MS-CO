import { KIND_LABELS } from '../sources/labels'
import type { ExternalKind } from '../sources/use-source-admin'

const KINDS: { kind: ExternalKind; description: string }[] = [
  { kind: 'spreadsheet_file', description: 'Envie um arquivo .csv ou .xlsx de até 50 MB.' },
  { kind: 'spreadsheet_url', description: 'Link de uma planilha compartilhada do Google Planilhas.' },
  { kind: 'postgres', description: 'Tabela ou consulta de leitura num banco PostgreSQL.' },
  { kind: 'mysql', description: 'Tabela ou consulta de leitura num banco MySQL.' },
  { kind: 'api', description: 'Endereço HTTP que devolve uma lista de itens em JSON.' },
]

export function KindPicker({ onPick }: { onPick: (kind: ExternalKind) => void }) {
  return (
    <fieldset>
      <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.12em]">Tipo de fonte</legend>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {KINDS.map(({ kind, description }) => (
          <li key={kind}>
            <button
              type="button"
              onClick={() => onPick(kind)}
              className="flex h-full w-full flex-col gap-2 bg-paper p-5 text-left cut-corner [--cut:16px] outline-none hover:bg-ink hover:text-white focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="font-display text-lg font-extrabold uppercase [font-stretch:112%]">{KIND_LABELS[kind]}</span>
              <span className="text-sm opacity-80">{description}</span>
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}
