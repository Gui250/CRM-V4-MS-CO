import type { Metadata } from 'next'
import { Archivo, Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import { QueryProvider } from '@/lib/query-provider'
import './globals.css'

const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo' })
const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })

export const metadata: Metadata = {
  title: 'V4 Company MS&CO',
  description: 'CRM V4 Company MS&CO: atendimento de leads pelo WhatsApp.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${instrument.variable} ${jetbrains.variable}`}>
      <body className="font-sans">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
