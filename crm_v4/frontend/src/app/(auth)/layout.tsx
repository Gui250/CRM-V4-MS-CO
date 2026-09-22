import { BrandLogo } from '@/components/brand-logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-brand px-6 py-8 text-white [--cut:72px] cut-corner md:px-12 md:py-12">
        <div className="bg-paper self-start p-2 cut-corner [--cut:10px]">
          <BrandLogo />
        </div>
        <div className="relative z-10 max-w-md py-10 md:py-0">
          <p className="font-display text-4xl leading-[0.95] font-extrabold uppercase [font-stretch:125%] md:text-6xl">
            Cada lead,
            <br />
            uma resposta.
          </p>
          <p className="mt-5 max-w-sm text-base text-white/85">
            O WhatsApp da MS&amp;CO em um só painel: conversas em tempo real para toda a equipe.
          </p>
        </div>
        {/* The logo's diagonal stroke, scaled up as a quiet background mark. */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-40 h-[140%] w-40 rotate-45 bg-white/10" />
        <p className="relative z-10 hidden font-mono text-xs text-white/70 md:block">CRM · V4 Company MS&amp;CO</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12 md:px-16">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  )
}
