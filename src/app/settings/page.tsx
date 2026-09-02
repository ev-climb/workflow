import Link from 'next/link'
import { AccountCalendars } from '@/components/settings/AccountCalendars'
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
        <h1 className="text-lg font-medium">Настройки</h1>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-100">
          К доскам
        </Link>
      </div>

      <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Google-аккаунты</h2>

        {connected ? (
          <p className="mt-2 text-sm text-emerald-400">Аккаунт {connected} подключён</p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Пока ни одного. Календарь наполнится, когда появится первый.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-800">
            {accounts.map((account) => (
              <li key={account.id} className="py-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm">{account.email}</span>
                  {account.needsReauth ? (
                    <a
                      href={connectUrl(account.email)}
                      className="rounded border border-amber-800 px-2 py-1 text-xs text-amber-300 outline-none hover:bg-amber-950 focus-visible:ring-1 focus-visible:ring-amber-600"
                    >
                      Доступ отозван — подключить заново
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-500">
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
          className="mt-4 inline-block rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
        >
          {accounts.length === 0 ? 'Подключить аккаунт' : 'Подключить ещё'}
        </a>
      </section>
    </main>
  )
}
