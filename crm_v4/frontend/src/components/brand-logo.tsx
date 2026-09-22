import Image from 'next/image'

export function BrandLogo({ tone = 'light', compact = false }: { tone?: 'light' | 'dark'; compact?: boolean }) {
  const text = tone === 'light' ? 'text-ink' : 'text-white'
  return (
    <div className="flex items-center gap-3">
      <Image src="/logo-v4.jpeg" alt="V4 Company" width={36} height={36} className="size-9 shrink-0" priority />
      {!compact && (
        <span className={`font-display text-[15px] leading-none font-extrabold uppercase [font-stretch:115%] ${text}`}>
          V4 Company
          <span className={`block pt-1 text-[11px] font-bold tracking-[0.2em] ${tone === 'light' ? 'text-brand' : 'text-white/70'}`}>MS&amp;CO</span>
        </span>
      )}
    </div>
  )
}
