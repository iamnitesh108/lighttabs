import { describe, expect, it } from 'vitest'
import { runLimited } from '../../src/core/limit.ts'

describe('runLimited', () => {
  it('never runs more than the limit at once, and runs everything', async () => {
    let running = 0
    let most = 0
    const done: number[] = []
    await runLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++
      most = Math.max(most, running)
      await new Promise((r) => setTimeout(r, n % 3))
      running--
      done.push(n)
    })
    expect(most).toBe(3)
    expect(done.toSorted()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('keeps going when a task fails', async () => {
    const done: number[] = []
    await runLimited([1, 2, 3], 1, async (n) => {
      if (n === 2) throw new Error('failed')
      done.push(n)
    })
    expect(done).toEqual([1, 3])
  })
})
