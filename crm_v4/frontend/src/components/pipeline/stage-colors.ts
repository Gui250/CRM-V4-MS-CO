import type { StageColor } from '@/lib/types'

// Full class names so Tailwind finds them; tokens live in globals.css (AA-checked in contrast.test.ts).
export const STAGE_COLOR_CLASSES: Record<StageColor, { chip: string; band: string; label: string }> = {
  gray: { chip: 'bg-stage-gray', band: 'bg-stage-gray-bg text-stage-gray border-stage-gray', label: 'Cinza' },
  red: { chip: 'bg-stage-red', band: 'bg-stage-red-bg text-stage-red border-stage-red', label: 'Vermelho' },
  orange: { chip: 'bg-stage-orange', band: 'bg-stage-orange-bg text-stage-orange border-stage-orange', label: 'Laranja' },
  amber: { chip: 'bg-stage-amber', band: 'bg-stage-amber-bg text-stage-amber border-stage-amber', label: 'Âmbar' },
  green: { chip: 'bg-stage-green', band: 'bg-stage-green-bg text-stage-green border-stage-green', label: 'Verde' },
  teal: { chip: 'bg-stage-teal', band: 'bg-stage-teal-bg text-stage-teal border-stage-teal', label: 'Turquesa' },
  blue: { chip: 'bg-stage-blue', band: 'bg-stage-blue-bg text-stage-blue border-stage-blue', label: 'Azul' },
  violet: { chip: 'bg-stage-violet', band: 'bg-stage-violet-bg text-stage-violet border-stage-violet', label: 'Violeta' },
}

export const STAGE_COLORS = Object.keys(STAGE_COLOR_CLASSES) as StageColor[]
