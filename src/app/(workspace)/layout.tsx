import { QueryProvider } from '@/components/QueryProvider'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>
}
