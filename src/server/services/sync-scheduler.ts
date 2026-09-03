import { syncAllCalendars } from './google-sync.ts'
import { syncAllTasks } from './google-tasks-sync.ts'
import { viewersOnline } from './viewers.ts'

/** Открыт хотя бы один стол: правку, сделанную в Google, ждём в течение минуты. */
export const FOREGROUND_INTERVAL_MS = 60_000

/**
 * Никто не смотрит. Ходить в Google всё равно надо — иначе при долгом простое протухнет
 * sync-токен и следующий проход будет полным, — но реже: квоты считаются за сутки.
 */
export const BACKGROUND_INTERVAL_MS = 10 * 60_000

/** Первый проход не на самом старте: приложение сначала должно подняться. */
export const STARTUP_DELAY_MS = 5_000

type SchedulerState = {
  timer: ReturnType<typeof setTimeout> | null
  stopped: boolean
  running: boolean
  /** Проход попросили, пока шёл предыдущий: следующий пойдёт сразу, а не по расписанию. */
  again: boolean
}

const store = globalThis as typeof globalThis & { syncScheduler?: SchedulerState }

/** Пустое значение и `0` — синхронизация включена, любое другое выключает её целиком. */
function disabled(): boolean {
  const value = process.env.SYNC_DISABLED?.trim() ?? ''
  return value !== '' && value !== '0'
}

export function nextDelayMs(): number {
  return viewersOnline() > 0 ? FOREGROUND_INTERVAL_MS : BACKGROUND_INTERVAL_MS
}

function schedule(state: SchedulerState, delay: number): void {
  if (state.stopped) return
  state.timer = setTimeout(() => void pass(state), delay)
  // таймер не должен мешать процессу завершиться
  state.timer.unref?.()
}

async function pass(state: SchedulerState): Promise<void> {
  if (state.stopped) return

  state.running = true
  try {
    const run = await syncAllCalendars()
    for (const failure of run.failures) {
      console.warn(`синхронизация календаря ${failure.calendarId} упала:`, failure.error)
    }

    // задачи идут тем же расписанием и тем же проходом: сетка показывает их вперемешку
    // с событиями, и разъезжаться этим двум выборкам незачем
    const tasks = await syncAllTasks()
    for (const failure of tasks.failures) {
      console.warn(`синхронизация задач аккаунта ${failure.accountId} упала:`, failure.error)
    }
  } catch (error) {
    // проход упал целиком — база или сеть; следующий по расписанию попробует заново
    console.warn('проход синхронизации упал:', error)
  }

  state.running = false

  // отсчёт от конца прохода, а не от начала: медленная синхронизация не должна
  // наслаиваться сама на себя
  const asked = state.again
  state.again = false
  schedule(state, asked ? 0 : nextDelayMs())
}

/**
 * Проход прямо сейчас, не дожидаясь очередного тика. Зовётся, когда ждать нечего и незачем:
 * аккаунт только что подключили, и до фонового тика его события не появились бы десять
 * минут. Просьба во время идущего прохода не запускает второй, а переносит следующий на
 * его конец: параллельные проходы удвоили бы запросы к Google без всякой пользы.
 */
export function syncNow(): void {
  const state = store.syncScheduler
  if (!state || state.stopped) return

  if (state.running) {
    state.again = true
    return
  }

  if (state.timer) clearTimeout(state.timer)
  schedule(state, 0)
}

/**
 * Таймер синхронизации в процессе приложения. Повторный вызов ничего не делает: в dev
 * `register` зовётся заново при перезапуске сервера, а второй таймер удвоил бы запросы.
 */
export function startSyncScheduler(): void {
  if (disabled()) {
    console.info('синхронизация выключена: SYNC_DISABLED')
    return
  }
  if (store.syncScheduler) return

  const state: SchedulerState = { timer: null, stopped: false, running: false, again: false }
  store.syncScheduler = state
  schedule(state, STARTUP_DELAY_MS)
}

export function stopSyncScheduler(): void {
  const state = store.syncScheduler
  if (!state) return

  state.stopped = true
  if (state.timer) clearTimeout(state.timer)
  store.syncScheduler = undefined
}
