type Props = { error: Error | null; className?: string }

export function Failure({ error, className = 'px-2 pb-1' }: Props) {
  if (!error) return null

  return (
    <p role="status" className={`text-xs text-alarm ${className}`}>
      Не сохранилось: {error.message}
    </p>
  )
}
