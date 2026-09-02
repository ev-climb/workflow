export async function register(): Promise<void> {
  // register зовётся и для edge-рантайма, где нет ни базы, ни таймеров процесса
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { startSyncScheduler } = await import('./server/services/sync-scheduler.ts')
  startSyncScheduler()
}
