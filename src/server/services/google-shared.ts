import { ConflictError } from './errors.ts'

/**
 * Раз в месяц выборка идёт полной заново, иначе горизонт не катится: у календарей окно
 * прибито к моменту запроса и само вперёд не едет (ADR-008, правило 5), у списков задач
 * разъехавшийся `updatedMin` молча теряет правки, ничем не отвечая (ADR-012).
 */
const FULL_RESYNC_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

export const INSERT_CHUNK = 500

/** Полный проход просрочен: метки нет вовсе или она старше месяца. */
export function needsFullSync(fullSyncedAt: Date | null, now: Date): boolean {
  return !fullSyncedAt || now.getTime() - fullSyncedAt.getTime() > FULL_RESYNC_INTERVAL_MS
}

export function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let at = 0; at < items.length; at += size) result.push(items.slice(at, at + size))
  return result
}

/**
 * Пагинация у Google не снимок: запись, изменённая между запросами соседних страниц,
 * приезжает в пачке дважды. Повтор ключа внутри одного `INSERT ... ON CONFLICT` Постгрес
 * не берёт — оставляем последнюю версию, она же самая свежая.
 */
export function lastPerKey<T>(items: T[], key: (item: T) => string): T[] {
  const byKey = new Map<string, T>()
  for (const item of items) byKey.set(key(item), item)
  return [...byKey.values()]
}

/**
 * Название записи в сообщениях. Три формы, а не одна: событие среднего рода, задача
 * женского, и падежи у них разные — «конфликт записи задачи», но «задачу правят».
 */
type Subject = {
  /** Родительный: «конфликт записи <события>». */
  of: string
  /** Целиком, с согласованным причастием: «<событие стёрто в Google>». */
  gone: string
  /** Винительный: «<событие> правят в Google». */
  edited: string
}

type Remote = { etag: string | null; googleUpdatedAt: Date | null }

type RemoteWrite<T extends Remote> = {
  subject: Subject
  /** Идентификатор записи у Google: в наших сообщениях виден именно он. */
  googleId: string
  /** Поля нашей правки — для лога конфликта. */
  fields: string[]
  etag: string | null
  /** Класс ошибки `412` своего API: у событий и задач они разные. */
  mismatch: new (...args: never[]) => Error
  patch: (etag: string | null) => Promise<T>
  /** Перечитать запись целиком. `null` — её в Google больше нет. */
  fetch: () => Promise<T | null>
  /** Разложить присланное Google к себе — тем же кодом, что и синхронизация. */
  apply: (remote: T) => Promise<void>
  /** Запись, которой в Google не стало: гасится тем же путём, что и присланная отмена. */
  gone: () => T
  /** Чужая версия, править которую нечем: отменённое событие. У задач такой нет. */
  cancelled?: (remote: T) => boolean
}

function reportConflict<T extends Remote>(io: RemoteWrite<T>, theirs: T | null): void {
  const when = theirs?.googleUpdatedAt?.toISOString() ?? 'неизвестно когда'
  const what = theirs ? `правка в Google от ${when}` : io.subject.gone
  console.warn(
    `конфликт записи ${io.subject.of} ${io.googleId}: ${what}, наш etag устарел;` +
      ` наши поля: ${io.fields.join(', ')}`,
  )
}

/**
 * Запись в Google: `PATCH` с `If-Match`. На `412` запись перечитывается, чужая версия
 * ложится в базу, и правка накладывается поверх неё вторым `PATCH` — правило «выигрывает
 * более свежая правка» из `02-technical.md`, раздел 4: наша правка приходит сейчас, то
 * есть она и есть более свежая. Чужие поля при этом остаются чужими: `PATCH` несёт только
 * то, что правим.
 */
export async function writeThroughEtag<T extends Remote>(
  io: RemoteWrite<T>,
): Promise<{ conflict: boolean; goneInGoogle: boolean }> {
  try {
    await io.apply(await io.patch(io.etag))
    return { conflict: false, goneInGoogle: false }
  } catch (error) {
    if (!(error instanceof io.mismatch)) throw error
  }

  const current = await io.fetch()
  reportConflict(io, current)

  // стёртое в Google правкой не воскрешаем: просьбы об этом не было
  if (!current || io.cancelled?.(current)) {
    await io.apply(current ?? io.gone())
    return { conflict: true, goneInGoogle: true }
  }

  await io.apply(current)

  try {
    await io.apply(await io.patch(current.etag))
    return { conflict: true, goneInGoogle: false }
  } catch (error) {
    // второй подряд 412 — запись правят прямо сейчас; крутить цикл дальше некуда
    if (error instanceof io.mismatch) {
      throw new ConflictError(
        `${io.subject.edited} ${io.googleId} правят в Google, правка не записана`,
      )
    }
    throw error
  }
}
