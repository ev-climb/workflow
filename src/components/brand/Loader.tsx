import { Logo, Mark } from './Logo'

/** Ожидание страницы: знак дышит, пока сервер собирает данные. */
export function Loader({ label, size = 84 }: { label: string; size?: number }) {
  return (
    <div role="status" className="flex flex-col items-center gap-4">
      <Mark size={size} className="brand-breathe" />
      <p className="text-[12.5px] tracking-[0.02em] text-fog-dim">{label}</p>
    </div>
  )
}

/** То же ожидание во весь экран: на первой отрисовке показывать больше нечего. */
export function FullLoader({ label }: { label: string }) {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-5 p-6">
      <Logo width={168} className="brand-breathe" />
      <p role="status" className="text-[12.5px] tracking-[0.02em] text-fog-dim">
        {label}
      </p>
    </main>
  )
}
