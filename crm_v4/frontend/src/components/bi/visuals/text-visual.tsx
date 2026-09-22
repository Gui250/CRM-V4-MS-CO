import type { Visual } from '@/lib/bi/types'

export function TextVisual({ visual, editing }: { visual: Visual; editing: boolean }) {
  const text = visual.options.text?.trim()
  if (!text) return editing ? <p className="text-sm text-muted">Escreva o texto em Propriedades.</p> : null
  return <p className="h-full overflow-auto text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
}
