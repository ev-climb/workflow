import Link from 'next/link'

/** Колонка календаря наполняется в фазе 05; ширина фиксирована уже сейчас — под неё верстается стол. */
export function CalendarColumn() {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-neutral-800 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-neutral-300">Календарь</h2>
        <Link href="/settings" className="text-xs text-neutral-500 hover:text-neutral-300">
          Настройки
        </Link>
      </div>
      <p className="mt-2 text-sm text-neutral-500">
        События появятся, когда будет подключён Google-аккаунт.
      </p>
    </aside>
  )
}
