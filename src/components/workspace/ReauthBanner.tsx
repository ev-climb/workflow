import { connectUrl } from '@/lib/google-oauth'
import type { GoogleAccountSummary } from '@/server/services/google-accounts'

type Props = { accounts: GoogleAccountSummary[] }

/**
 * Полоса над столом: доступ к аккаунту отозван, события по нему больше не приезжают.
 * Остальные аккаунты при этом работают, поэтому полоса называет почту — иначе непонятно,
 * что именно переподключать.
 */
export function ReauthBanner({ accounts }: Props) {
  if (accounts.length === 0) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-200"
    >
      <span>Google отозвал доступ — события не обновляются, пока не подключишь заново.</span>
      {accounts.map((account) => (
        <a
          key={account.id}
          href={connectUrl(account.email)}
          className="rounded border border-amber-700 px-2 py-1 font-medium text-amber-100 outline-none hover:bg-amber-900 focus-visible:ring-1 focus-visible:ring-amber-500"
        >
          Подключить заново {account.email}
        </a>
      ))}
    </div>
  )
}
