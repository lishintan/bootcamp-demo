import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import TopNav from '@/components/TopNav'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Product Intelligence Dashboard',
  description: 'Mindvalley Product & Creatives — Insights and Customer Research',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-gray-950 text-gray-100 antialiased">
        <TopNav />
        <main className="max-w-screen-xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
