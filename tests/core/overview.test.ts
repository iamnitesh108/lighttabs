import { describe, expect, it } from 'vitest'
import type { Arrangement } from '../../src/core/overview.ts'
import {
  arranged,
  dropInCell,
  isArranged,
  overviewOf,
  swapped,
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

/** A list shown as rows of a grid this many columns wide. */
const rows = (list: string[], columns: number) =>
  Array.from({ length: Math.ceil(list.length / columns) }, (_, r) =>
    list.slice(r * columns, r * columns + columns).join(' '),
  )

describe('dropInCell', () => {
  const wide5 = [...'ABCDEFGHIJKLMNO', 'X'] // A B C D E / F G H I J / K L M N O / X
  const wide4 = [...'ABCDEFGHIJKL'] // A B C D / E F G H / I J K L

  it.each([
    {
      name: 'X between E and J',
      run: wide5,
      moved: 'X',
      cell: 9, // J's cell
      columns: 5,
      want: ['A B C D E', 'F G H I X', 'K L M N J', 'O'],
    },
    {
      name: 'X between B and G',
      run: wide5,
      moved: 'X',
      cell: 6,
      columns: 5,
      want: ['A B C D E', 'F X H I J', 'K G L M N', 'O'],
    },
    {
      name: 'F between C and G: from just before the cell',
      run: wide4,
      moved: 'F',
      cell: 6,
      columns: 4,
      want: ['A B C D', 'E H F I', 'J K G L'],
    },
    {
      name: 'A between C and G: from the row above',
      run: wide4,
      moved: 'A',
      cell: 6,
      columns: 4,
      want: ['B C D E', 'F H A I', 'J K G L'],
    },
    {
      name: 'J between B and F: from the row below (a swap)',
      run: wide4,
      moved: 'J',
      cell: 5,
      columns: 4,
      want: ['A B C D', 'E J G H', 'I F K L'],
    },
    {
      name: 'L between A and E: from the last cell',
      run: wide4,
      moved: 'L',
      cell: 4,
      columns: 4,
      want: ['A B C D', 'L F G H', 'E I J K'],
    },
    {
      name: 'nothing in the cell below: that card goes last',
      run: wide4,
      moved: 'A',
      cell: 9, // J, which has nothing below
      columns: 4,
      want: ['B C D E', 'F G H I', 'K A L J'], // A in J's old cell
    },
    {
      name: 'an empty cell past the end: the card goes last',
      run: wide4,
      moved: 'B',
      cell: 13,
      columns: 4,
      want: ['A C D E', 'F G H I', 'J K L B'],
    },
    {
      name: 'dropped into its own cell: nothing changes',
      run: wide4,
      moved: 'F',
      cell: 5,
      columns: 4,
      want: ['A B C D', 'E F G H', 'I J K L'],
    },
  ])('$name', ({ run, moved, cell, columns, want }) => {
    expect(rows(dropInCell(run, moved, cell, columns), columns)).toEqual(want)
  })

  it('takes a card from outside the run', () => {
    // Y comes from another run of cards (say, below a group).
    expect(rows(dropInCell(wide4, 'Y', 1, 4), 4)).toEqual([
      'A Y C D',
      'E B F G',
      'H I J K',
      'L',
    ])
  })
})

describe('swapped', () => {
  it('trades two places and leaves the rest', () => {
    expect(swapped([...'ABCD'], 'B', 'D')).toEqual([...'ADCB'])
  })
})
