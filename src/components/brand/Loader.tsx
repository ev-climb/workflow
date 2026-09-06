import { Wordmark } from './Logo'

const MARK_PATH = 'M13 11 L35 61 L50 27 L65 61 L87 11'

/** Знак обводит сам себя штрихом: ожидание фирменным начертанием, а не спиннером. */
function DrawnMark({ width }: { width: number }) {
  return (
    <svg
      viewBox="0 0 100 72"
      width={width}
      height={Math.round(width * 0.72)}
      fill="none"
      aria-hidden
      className="relative overflow-visible"
    >
      <defs>
        <linearGradient id="loader-stroke" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#57e0b0" />
          <stop offset="38%" stopColor="#63d8dd" />
          <stop offset="68%" stopColor="#8fb6f2" />
          <stop offset="100%" stopColor="#b58cf6" />
        </linearGradient>
      </defs>
      <path
        d={MARK_PATH}
        stroke="var(--color-hair)"
        strokeWidth={15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* пунктир длиннее самой линии: концы штриха успевают скрыться за краями знака */}
      <path
        d={MARK_PATH}
        pathLength={100}
        stroke="url(#loader-stroke)"
        strokeWidth={15}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="104 104"
        className="brand-draw"
      />
    </svg>
  )
}

/**
 * Ожидание страницы во весь экран. Это фолбэк границы Suspense: его рисует сервер, а
 * поток заменяет готовой страницей — без участия клиентского кода.
 */
export function FullLoader({ label }: { label: string }) {
  return (
    <main data-slot="loader" className="loader-screen grid h-screen place-items-center p-6">
      <div className="relative flex flex-col items-center gap-9">
        <div className="brand-float relative grid h-[152px] w-[216px] place-items-center">
          <div className="brand-glow absolute h-[108px] w-[168px] rounded-full blur-[38px]" />
          <DrawnMark width={216} />
        </div>

        <div className="loader-rise flex flex-col items-center gap-5">
          <Wordmark height={34} />
          <div className="relative h-[3px] w-[196px] overflow-hidden rounded-full bg-hair">
            <div className="loader-bar absolute inset-0 rounded-full" />
          </div>
          <p
            role="status"
            className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-fog-muted"
          >
            {label}
          </p>
        </div>
      </div>
    </main>
  )
}
