// Chart colors come from the brand tokens in src/app/globals.css (--color-brand, --color-stage-*).
// ECharts draws on a canvas/SVG and can't read CSS variables, so the values are copied here.

/** Brand red first, then the dark stage tones: all ≥ 3:1 against white (WCAG non-text contrast). */
export const SERIES_COLORS = ['#e30613', '#1e4a9e', '#1d6433', '#8a3a06', '#5b33a3', '#0f5d58', '#6e4d00', '#3f3f3f']
export const CHART_TEXT = '#141414'
export const CHART_GRID = '#e3e3e1'
export const CHART_MUTED = '#686868'
export const CHART_BACKGROUND = '#ffffff'
/** Opacity of the points that are not the cross-filtered one. */
export const DIMMED_OPACITY = 0.35
