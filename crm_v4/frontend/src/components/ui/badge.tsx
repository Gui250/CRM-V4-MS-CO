export function Badge({ children, tone = 'brand' }: { children: React.ReactNode; tone?: 'brand' | 'neutral' }) {
  const tones = { brand: 'bg-brand text-white', neutral: 'bg-mist text-ink' }
  return (
    <span className={`inline-flex min-w-5 h-5 items-center justify-center px-1.5 font-mono text-[11px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  )
}
