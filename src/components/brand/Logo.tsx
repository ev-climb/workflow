/**
 * Знак и знак с названием. Картинки лежат готовыми в public: оптимизатор next/image
 * ради трёх статичных файлов тянуть незачем, а в образе он потребовал бы sharp.
 */
export function Mark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/mark.png"
      alt=""
      width={size}
      height={Math.round((size * 287) / 480)}
      className={className || undefined}
    />
  )
}

export function Logo({ width = 220, className = '' }: { width?: number; className?: string }) {
  return (
    <img
      src="/brand/logo.png"
      alt="WorkFlow"
      width={width}
      height={Math.round((width * 479) / 660)}
      className={className || undefined}
    />
  )
}
