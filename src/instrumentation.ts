export async function register(): Promise<void> {
  // register зовётся и для edge-рантайма, где нет ни базы, ни таймеров процесса
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // ключ проверяется до всего остального: кривой всплыл бы падением расшифровки в фоне
  const { checkMasterKey } = await import('./lib/master-key.ts')
  checkMasterKey()

  const { startSyncScheduler } = await import('./server/services/sync-scheduler.ts')
  startSyncScheduler()
}
