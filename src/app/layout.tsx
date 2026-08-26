import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WorkFlow',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  )
}
