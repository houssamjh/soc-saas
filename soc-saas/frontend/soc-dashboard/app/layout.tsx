import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import Sidebar from '@/components/layout/Sidebar'

export const metadata: Metadata = {
  title: 'SOC Platform',
  description: 'Security Operations Center Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0f1117] text-[#e6edf3] min-h-screen">
        <Providers>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
