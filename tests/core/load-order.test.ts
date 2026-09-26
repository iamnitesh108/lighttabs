import { describe, expect, it } from 'vitest'
import { loadLimit, nearestFirst } from '../../src/core/load-order.ts'

describe('nearestFirst', () => {
  it('starts next to the current tab, right side first on a tie', () => {
    const tabs = [0, 1, 2, 4, 5, 9].map((index) => ({ index }))
    expect(nearestFirst(tabs, 3).map((t) => t.index)).toEqual([
      4, 2, 5, 1, 0, 9,
    ])
  })
})

describe('loadLimit', () => {
  it('uses half the cores, between 2 and 6', () => {
    expect([1, 2, 4, 8, 12, 32].map(loadLimit)).toEqual([2, 2, 2, 4, 6, 6])
  })
})
