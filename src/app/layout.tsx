import type { Metadata } from 'next'
import { JetBrains_Mono, Manrope } from 'next/font/google'
import './globals.css'

// шрифты забираются на сборке и раздаются со своего домена: в рантайме к Google похода нет
const ui = Manrope({ subsets: ['cyrillic', 'latin'], variable: '--font-ui', display: 'swap' })

// цифры — временем, счётчиками, сроками — набираются моноширинным: столбцы не пляшут
const numeric = JetBrains_Mono({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500'],
  variable: '--font-numeric',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'WorkFlow',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${ui.variable} ${numeric.variable}`}>
      <body className="min-h-screen font-sans text-fog antialiased">{children}</body>
    </html>
  )
}
