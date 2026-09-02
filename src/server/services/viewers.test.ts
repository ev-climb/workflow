import { describe, expect, it } from 'vitest'
import { trackViewer, viewersOnline } from './viewers.ts'

describe('счётчик открытых вкладок', () => {
  it('растёт на вкладку и падает на её отписке', () => {
    const before = viewersOnline()

    const first = trackViewer()
    const second = trackViewer()
    expect(viewersOnline()).toBe(before + 2)

    first()
    expect(viewersOnline()).toBe(before + 1)

    second()
    expect(viewersOnline()).toBe(before)
  })

  it('повторная отписка счётчик не роняет', () => {
    const before = viewersOnline()
    const release = trackViewer()

    release()
    release()

    expect(viewersOnline()).toBe(before)
  })
})
