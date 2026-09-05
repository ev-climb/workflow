import { Logo } from '@/components/brand/Logo'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <h1>
        <Logo width={200} />
      </h1>
      <form
        method="post"
        action="/api/auth/login"
        className="surface-sheet w-full max-w-xs space-y-4 rounded-2xl p-6"
      >
        <input type="hidden" name="next" value={next ?? '/'} />
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Пароль"
          className="field w-full px-3 py-2"
        />
        {error ? <p className="text-sm text-alarm">Пароль не подошёл</p> : null}
        <button type="submit" className="btn-primary w-full px-3 py-2">
          Войти
        </button>
      </form>
    </main>
  )
}
