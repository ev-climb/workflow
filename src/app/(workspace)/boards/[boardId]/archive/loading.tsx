import { Loader } from '@/components/brand/Loader'

export default function Loading() {
  return (
    <main className="mx-auto flex h-screen w-full max-w-3xl items-center justify-center p-6">
      <Loader label="Открываем архив" size={64} />
    </main>
  )
}
