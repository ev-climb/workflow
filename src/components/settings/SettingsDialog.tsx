'use client'

import { useQuery } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import { AccountCalendars } from '@/components/settings/AccountCalendars'
import { AccountColor } from '@/components/settings/AccountColor'
import { accountsQuery, calendarsQuery } from '@/lib/calendar-query'
import { formatMoment } from '@/lib/dates'
import { connectUrl } from '@/lib/google-oauth'

type Props = {
  /** Итог возврата из Google: показывается той же панелью, которая его и затеяла. */
  notice: { connected?: string; error?: string } | null
  onClose: () => void
}

/**
 * Google-аккаунты и их календари. Живёт попапом поверх стола, а не отдельной страницей:
 * галочку видимости и цвет ставят, глядя на сетку, и уход со стола ради этого сбивал бы
 * показанный отрезок.
 *
 * Списки читаются через TanStack Query, как и всё на столе: правка календаря гасит и их,
 * и сетку — цвет события берётся из календаря.
 */
export function SettingsDialog({ notice, onClose }: Props) {
  const accounts = useQuery(accountsQuery)
  const calendars = useQuery(calendarsQuery)
  const failure = accounts.error ?? calendars.error

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="surface-sheet fixed top-1/2 left-1/2 z-50 max-h-[calc(100vh-4rem)] w-[34rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-5 outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-medium text-fog">Настройки</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-fog-dim">
                Google-аккаунты и их календари
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Закрыть настройки"
              className="btn-quiet px-2 py-0.5 leading-none"
            >
              ✕
            </Dialog.Close>
          </div>

          {notice?.connected ? (
            <p className="mt-3 text-sm text-done">Аккаунт {notice.connected} подключён</p>
          ) : null}
          {notice?.error ? <p className="mt-3 text-sm text-alarm">{notice.error}</p> : null}

          {failure ? (
            <p role="status" className="mt-3 text-sm text-alarm">
              Аккаунты не прочитались: {failure.message}
            </p>
          ) : null}

          {accounts.isPending || calendars.isPending ? (
            <p className="mt-3 text-sm text-fog-dim">Читаем аккаунты…</p>
          ) : accounts.data?.length === 0 ? (
            <p className="mt-3 text-sm text-fog-dim">
              Пока ни одного. Календарь наполнится, когда появится первый.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-hair">
              {(accounts.data ?? []).map((account) => (
                <li key={account.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm">{account.email}</span>
                      <AccountColor account={account} />
                    </div>
                    {account.needsReauth ? (
                      <a
                        href={connectUrl(account.email)}
                        className="rounded-lg border border-caution-line px-2.5 py-1 text-xs text-caution outline-none transition-colors hover:bg-caution-wash focus-visible:ring-1 focus-visible:ring-caution-line"
                      >
                        Доступ отозван — подключить заново
                      </a>
                    ) : (
                      <span className="font-mono text-[11px] text-fog-faint">
                        подключён {formatMoment(account.connectedAt)}
                      </span>
                    )}
                  </div>
                  <AccountCalendars
                    calendars={(calendars.data ?? []).filter(
                      (calendar) => calendar.accountId === account.id,
                    )}
                  />
                </li>
              ))}
            </ul>
          )}

          <a href={connectUrl()} className="btn-primary mt-4 inline-block px-3 py-2 text-sm">
            {accounts.data?.length ? 'Подключить ещё' : 'Подключить аккаунт'}
          </a>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
