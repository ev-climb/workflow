export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        method="post"
        action="/api/auth/login"
        className="w-full max-w-xs space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-6"
      >
        <h1 className="text-lg font-medium">WorkFlow</h1>
        <input type="hidden" name="next" value={next ?? '/'} />
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Пароль"
          className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-neutral-500"
        />
        {error ? <p className="text-sm text-red-400">Пароль не подошёл</p> : null}
        <button
          type="submit"
          className="w-full rounded bg-neutral-100 px-3 py-2 font-medium text-neutral-900 hover:bg-white"
        >
          Войти
        </button>
      </form>
    </main>
  )
}
