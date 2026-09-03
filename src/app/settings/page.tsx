import Link from 'next/link'
import { AccountCalendars } from '@/components/settings/AccountCalendars'
import { AccountColor } from '@/components/settings/AccountColor'
import { formatMoment } from '@/lib/dates'
import { connectUrl } from '@/lib/google-oauth'
import { listGoogleAccounts } from '@/server/services/google-accounts'
import { listGoogleCalendars } from '@/server/services/google-calendars'

// список аккаунтов меняется прямо здесь же, возвратом из Google: прегенерация отдавала бы вчерашнее
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ connected?: string; error?: string }> }

export default async function SettingsPage({ searchParams }: Props) {
  const [{ connected, error }, accounts, calendars] = await Promise.all([
    searchParams,
    listGoogleAccounts(),
    listGoogleCalendars(),
  ])

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-[-0.01em]">Настройки</h1>
        <Link href="/" className="text-sm text-fog-dim transition-colors hover:text-fog">
          К доскам
        </Link>
      </div>

      <section className="surface-column mt-6 p-5">
        <h2 className="text-[13.5px] font-semibold text-fog">Google-аккаунты</h2>

        {connected ? (
          <p className="mt-2 text-sm text-done">Аккаунт {connected} подключён</p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-alarm">{error}</p> : null}

        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-fog-dim">
            Пока ни одного. Календарь наполнится, когда появится первый.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-hair">
            {accounts.map((account) => (
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
                      подключён {formatMoment(account.connectedAt.toISOString())}
                    </span>
                  )}
                </div>
                <AccountCalendars
                  calendars={calendars.filter((calendar) => calendar.accountId === account.id)}
                />
              </li>
            ))}
          </ul>
        )}

        <a
          href={connectUrl()}
          className="btn-primary mt-4 inline-block px-3 py-2 text-sm"
        >
          {accounts.length === 0 ? 'Подключить аккаунт' : 'Подключить ещё'}
        </a>
      </section>
    </main>
  )
}
