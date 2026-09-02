import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKGROUND_INTERVAL_MS,
  FOREGROUND_INTERVAL_MS,
  STARTUP_DELAY_MS,
  startSyncScheduler,
  stopSyncScheduler,
  syncNow,
} from './sync-scheduler.ts'

vi.mock('./google-sync.ts', () => ({ syncAllCalendars: vi.fn() }))
vi.mock('./viewers.ts', () => ({ viewersOnline: vi.fn() }))

const { syncAllCalendars } = vi.mocked(await import('./google-sync.ts'))
const { viewersOnline } = vi.mocked(await import('./viewers.ts'))

const idle = { results: [], failures: [] }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  syncAllCalendars.mockResolvedValue(idle)
  viewersOnline.mockReturnValue(0)
  delete process.env.SYNC_DISABLED
})

afterEach(() => {
  stopSyncScheduler()
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete process.env.SYNC_DISABLED
})

describe('таймер синхронизации', () => {
  it('первый проход идёт не на старте, а спустя стартовую задержку', async () => {
    startSyncScheduler()

    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS - 1)
    expect(syncAllCalendars).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(syncAllCalendars).toHaveBeenCalledTimes(1)
  })

  it('при открытой вкладке ходит раз в минуту', async () => {
    viewersOnline.mockReturnValue(1)
    startSyncScheduler()

    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS)
    await vi.advanceTimersByTimeAsync(FOREGROUND_INTERVAL_MS * 3)

    expect(syncAllCalendars).toHaveBeenCalledTimes(4)
  })

  it('без открытых вкладок — раз в десять минут', async () => {
    startSyncScheduler()

    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS)
    await vi.advanceTimersByTimeAsync(FOREGROUND_INTERVAL_MS * 9)
    expect(syncAllCalendars).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(FOREGROUND_INTERVAL_MS)
    expect(syncAllCalendars).toHaveBeenCalledTimes(2)
  })

  it('частота выбирается на каждом проходе: закрытая вкладка замедляет следующий', async () => {
    viewersOnline.mockReturnValue(1)
    startSyncScheduler()
    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS)

    viewersOnline.mockReturnValue(0)
    await vi.advanceTimersByTimeAsync(FOREGROUND_INTERVAL_MS)
    expect(syncAllCalendars).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(FOREGROUND_INTERVAL_MS)
    expect(syncAllCalendars).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(BACKGROUND_INTERVAL_MS)
    expect(syncAllCalendars).toHaveBeenCalledTimes(3)
  })

  it('SYNC_DISABLED останавливает таймер целиком', async () => {
    process.env.SYNC_DISABLED = '1'
    startSyncScheduler()

    await vi.advanceTimersByTimeAsync(BACKGROUND_INTERVAL_MS * 2)
    expect(syncAllCalendars).not.toHaveBeenCalled()
  })

  it('нулевое значение SYNC_DISABLED синхронизацию не выключает', async () => {
    process.env.SYNC_DISABLED = '0'
    startSyncScheduler()

    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS)
    expect(syncAllCalendars).toHaveBeenCalledTimes(1)
  })

  it('повторный запуск не заводит второй таймер', async () => {
    startSyncScheduler()
    startSyncScheduler()

    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS)
    expect(syncAllCalendars).toHaveBeenCalledTimes(1)
  })

  it('упавший проход не разрывает расписание', async () => {
    viewersOnline.mockReturnValue(1)
    syncAllCalendars.mockRejectedValueOnce(new Error('база прилегла'))
    startSyncScheduler()

    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS)
    await vi.advanceTimersByTimeAsync(FOREGROUND_INTERVAL_MS)

    expect(syncAllCalendars).toHaveBeenCalledTimes(2)
  })

  it('календарь, упавший в проходе, попадает в лог', async () => {
    syncAllCalendars.mockResolvedValueOnce({
      results: [],
      failures: [{ calendarId: 'кал-1', error: new Error('503') }],
    })
    startSyncScheduler()

    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('кал-1'),
      expect.any(Error),
    )
  })

  it('следующий проход отсчитывается от конца предыдущего', async () => {
    viewersOnline.mockReturnValue(1)
    let finish = () => {}
    syncAllCalendars.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(idle)
        }),
    )
    startSyncScheduler()

    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS)
    // проход идёт дольше своего интервала: второй не должен стартовать ему навстречу
    await vi.advanceTimersByTimeAsync(FOREGROUND_INTERVAL_MS * 2)
    expect(syncAllCalendars).toHaveBeenCalledTimes(1)

    finish()
    await vi.advanceTimersByTimeAsync(FOREGROUND_INTERVAL_MS)
    expect(syncAllCalendars).toHaveBeenCalledTimes(2)
  })

  it('остановленный таймер больше не просыпается', async () => {
    startSyncScheduler()
    stopSyncScheduler()

    await vi.advanceTimersByTimeAsync(BACKGROUND_INTERVAL_MS * 2)
    expect(syncAllCalendars).not.toHaveBeenCalled()
  })

  it('просьба пройтись сейчас не ждёт очередного тика', async () => {
    startSyncScheduler()
    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS)
    expect(syncAllCalendars).toHaveBeenCalledTimes(1)

    syncNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(syncAllCalendars).toHaveBeenCalledTimes(2)
  })

  it('после внеочередного прохода расписание продолжается как обычно', async () => {
    startSyncScheduler()
    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS)

    syncNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(syncAllCalendars).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(BACKGROUND_INTERVAL_MS)
    expect(syncAllCalendars).toHaveBeenCalledTimes(3)
  })

  it('просьба во время прохода переносит следующий на его конец, а не запускает второй', async () => {
    let finish = () => {}
    syncAllCalendars.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(idle)
        }),
    )
    startSyncScheduler()
    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS)

    syncNow()
    await vi.advanceTimersByTimeAsync(BACKGROUND_INTERVAL_MS)
    expect(syncAllCalendars).toHaveBeenCalledTimes(1)

    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(syncAllCalendars).toHaveBeenCalledTimes(2)
  })

  it('без поднятого таймера просьба ничего не делает', async () => {
    syncNow()

    await vi.advanceTimersByTimeAsync(BACKGROUND_INTERVAL_MS)
    expect(syncAllCalendars).not.toHaveBeenCalled()
  })
})
