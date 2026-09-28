import { describe, expect, it } from 'vitest'
import type { Arrangement, Landing } from '../../src/core/overview.ts'
import {
  arranged,
  dropInColumn,
  isArranged,
  overviewOf,
  withArranged,
} from '../../src/core/overview.ts'
import type { TabInfo } from '../../src/core/tab.ts'

const tab = (id: number, windowId: number, index: number, groupId = -1) =>
  ({ id, windowId, index, groupId }) as TabInfo

/** A window's items in short: a tab as its id, a group as [groupId, tab ids]. */
function shown(tabs: readonly TabInfo[], arrangement?: Arrangement) {
  return overviewOf(tabs, arrangement).map((w) =>
    w.items.map((i) =>
      i.kind === 'tab' ? i.tab.id : [i.groupId, i.tabs.map((t) => t.id)],
    ),
  )
}

// Window 1: tabs 1, 2 (A), group 7 with 3, 4 (B), tabs 5, 6 (C). Window 2: group 9.
const tabs = [
  tab(4, 1, 3, 7),
  tab(1, 1, 0),
  tab(2, 1, 1),
  tab(3, 1, 2, 7),
  tab(5, 1, 4),
  tab(6, 1, 5),
  tab(7, 2, 0, 9),
]

describe('overviewOf', () => {
  it('lists each window in tab order, each group as one item', () => {
    expect(shown(tabs)).toEqual([[1, 2, [7, [3, 4]], 5, 6], [[9, [7]]]])
  })

  it.each([
    {
      name: 'a tab from after a group moves before it (C to A)',
      items: ['tab:5', 'tab:1'],
      want: [5, 2, [7, [3, 4]], 1, 6],
    },
    {
      name: 'a group moves between two tabs',
      items: ['tab:1', 'group:7', 'tab:2'],
      want: [1, [7, [3, 4]], 2, 5, 6],
    },
    {
      name: 'a group moves to the end',
      items: ['tab:1', 'tab:2', 'tab:5', 'tab:6', 'group:7'],
      want: [1, 2, 5, 6, [7, [3, 4]]],
    },
    {
      name: 'nothing moves to another window',
      items: ['group:9', 'tab:1'],
      want: [1, 2, [7, [3, 4]], 5, 6],
    },
  ])('$name', ({ items, want }) => {
    expect(shown(tabs, { cards: [], items })[0]).toEqual(want)
  })

  it('arranges tabs inside a group, which moved too', () => {
    expect(
      shown(tabs, { cards: [4, 3], items: ['group:7', 'tab:1'] })[0],
    ).toEqual([[7, [4, 3]], 2, 1, 5, 6])
  })
})

const ids = (list: readonly TabInfo[]) => list.map((t) => t.id)

describe('arranged', () => {
  const section = [tab(1, 1, 0), tab(2, 1, 1), tab(3, 1, 2), tab(4, 1, 3)]

  it.each([
    {
      name: 'nothing arranged: tab strip order',
      order: [],
      want: [1, 2, 3, 4],
    },
    { name: 'every card arranged', order: [4, 2, 1, 3], want: [4, 2, 1, 3] },
    {
      name: 'a tab never arranged keeps its place',
      order: [4, 2, 1],
      want: [4, 2, 3, 1],
    },
    {
      name: 'ids of other sections are ignored',
      order: [9, 3, 8, 1],
      want: [3, 2, 1, 4],
    },
  ])('$name', ({ order, want }) => {
    expect(ids(arranged(section, order, (t) => t.id))).toEqual(want)
  })
})

describe('withArranged', () => {
  it('puts the section in its new order and keeps other sections', () => {
    expect(withArranged([5, 1, 2, 6], [2, 1, 3])).toEqual([5, 6, 2, 1, 3])
  })
})

describe('isArranged', () => {
  it.each([
    { cards: [], items: [], want: false },
    { cards: [3, 4], items: ['tab:1', 'tab:2'], want: false }, // same as the tab strip
    { cards: [4, 3], items: [], want: true },
    { cards: [9, 8], items: [], want: false }, // only closed tabs
    { cards: [], items: ['group:7', 'tab:1'], want: true },
  ])('cards $cards, items $items → $want', ({ cards, items, want }) => {
    expect(isArranged(tabs, { cards, items })).toBe(want)
  })
})

/** A list shown as rows of a 5-wide grid. */
const rows = (list: string[]) =>
  Array.from({ length: Math.ceil(list.length / 5) }, (_, r) =>
    list.slice(r * 5, r * 5 + 5).join(' '),
  )

describe('dropInColumn', () => {
  // A 5-wide grid:  A B C D E / F G H I J / K L M N O, then X.
  const grid = [...'ABCDEFGHIJKLMNO', 'X']
  it.each([
    {
      name: 'X between E and J',
      moved: 'X',
      lower: 'J',
      landing: { before: 'O' },
      want: ['A B C D E', 'F G H I X', 'K L M N J', 'O'],
    },
    {
      name: 'X between B and G',
      moved: 'X',
      lower: 'G',
      landing: { before: 'L' },
      want: ['A B C D E', 'F X H I J', 'K G L M N', 'O'],
    },
    {
      name: 'the card below moves up: a swap',
      moved: 'L',
      lower: 'G',
      landing: { before: 'L' },
      want: ['A B C D E', 'F L H I J', 'K G M N O', 'X'],
    },
    {
      name: 'nothing below lower: it goes after the last card',
      moved: 'X',
      lower: 'N',
      landing: { after: 'O' },
      want: ['A B C D E', 'F G H I J', 'K L M X O', 'N'],
    },
  ])('$name', ({ moved, lower, landing, want }) => {
    expect(
      rows(dropInColumn(grid, moved, lower, landing as Landing<string>)),
    ).toEqual(want)
  })
})
