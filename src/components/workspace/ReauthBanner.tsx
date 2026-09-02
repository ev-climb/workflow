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
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-caution-line bg-caution-wash px-4 py-2 text-xs text-caution backdrop-blur-md"
    >
      <span>Google отозвал доступ — события не обновляются, пока не подключишь заново.</span>
      {accounts.map((account) => (
        <a
          key={account.id}
          href={connectUrl(account.email)}
          className="rounded-lg border border-caution-line px-2.5 py-1 font-medium text-caution outline-none transition-colors hover:bg-caution-wash focus-visible:ring-1 focus-visible:ring-caution-line"
        >
          Подключить заново {account.email}
        </a>
      ))}
    </div>
  )
}
