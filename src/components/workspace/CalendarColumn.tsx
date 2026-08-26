/** Колонка календаря наполнится в фазе 05; ширина фиксирована уже сейчас — под неё верстается стол. */
export function CalendarColumn() {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-neutral-800 p-3">
      <h2 className="text-sm font-medium text-neutral-300">Календарь</h2>
      <p className="mt-2 text-sm text-neutral-500">Появится в фазе 05.</p>
    </aside>
  )
}
