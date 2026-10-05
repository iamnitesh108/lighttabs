import { describe, expect, it } from 'vitest'
import type { Box } from '../../src/core/grid-nav.ts'
import { columnOrder } from '../../src/core/grid-nav.ts'

/** Cards in reading order, `columns` per row. */
function grid(count: number, columns: number): Box[] {
  return Array.from({ length: count }, (_, i) => ({
    left: (i % columns) * 110,
    top: Math.floor(i / columns) * 70,
  }))
}

describe('columnOrder', () => {
  it.each([
    // A B C / D E F / G H  →  A D G B E H C F
    ['a full and a short last row', grid(8, 3), [0, 3, 6, 1, 4, 7, 2, 5]],
    ['one row', grid(3, 3), [0, 1, 2]],
    ['one column', grid(3, 1), [0, 1, 2]],
    ['a single card', grid(1, 3), [0]],
    ['nothing', [], []],
  ] as const)('%s', (_name, boxes, expected) => {
    expect(columnOrder(boxes)).toEqual(expected)
  })

  it('keeps cards a fraction of a pixel apart in one column', () => {
    const boxes = [
      { left: 0.4, top: 0 },
      { left: 110, top: 0 },
      { left: 0, top: 70 },
    ]
    expect(columnOrder(boxes)).toEqual([0, 2, 1])
  })
})
