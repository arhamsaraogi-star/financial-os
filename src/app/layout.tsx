import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, IBM_Plex_Mono, Inter } from 'next/font/google'
import './globals.css'
import { StoreProvider } from '@/lib/store'
import { Shell } from '@/components/Shell'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-serif',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-face',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Financial Operating System',
  description:
    'A personal CFO: cash-flow simulation, automated treasury rules, and forecasting for a single household.',
  applicationName: 'Financial OS',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Financial OS' },
}

export const viewport: Viewport = {
  themeColor: '#08090B',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <StoreProvider>
          <Shell>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  )
}
