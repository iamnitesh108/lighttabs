import { describe, expect, it } from 'vitest'
import {
  arranged,
  isArranged,
  overviewOf,
  withArranged,
} from '../../src/core/overview.ts'
import type { TabInfo } from '../../src/core/tab.ts'

const tab = (id: number, windowId: number, index: number, groupId = -1) =>
  ({ id, windowId, index, groupId }) as TabInfo

describe('overviewOf', () => {
  it('groups tabs by window, then by runs of one tab group, in tab order', () => {
    const tabs = [
      tab(3, 1, 2, 7),
      tab(1, 1, 0),
      tab(2, 1, 1, 7),
      tab(4, 1, 3),
      tab(5, 2, 0, 9),
    ]
    const ids = overviewOf(tabs).map((w) => ({
      windowId: w.windowId,
      sections: w.sections.map((s) => [s.groupId, s.tabs.map((t) => t.id)]),
    }))
    expect(ids).toEqual([
      {
        windowId: 1,
        sections: [
          [-1, [1]],
          [7, [2, 3]],
          [-1, [4]],
        ],
      },
      { windowId: 2, sections: [[9, [5]]] },
    ])
  })
})

const ids = (tabs: readonly TabInfo[]) => tabs.map((t) => t.id)

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
    expect(ids(arranged(section, order))).toEqual(want)
  })
})

describe('withArranged', () => {
  it('puts the section in its new order and keeps other sections', () => {
    expect(withArranged([5, 1, 2, 6], [2, 1, 3])).toEqual([5, 6, 2, 1, 3])
  })
})

describe('overviewOf with an order', () => {
  it('arranges within each section, never across a group', () => {
    const tabs = [tab(1, 1, 0), tab(2, 1, 1, 7), tab(3, 1, 2, 7), tab(4, 1, 3)]
    // 4 was put before 1, but they are in different sections (a group between).
    const sections = overviewOf(tabs, [4, 1, 3, 2])[0].sections
    expect(sections.map((s) => ids(s.tabs))).toEqual([[1], [3, 2], [4]])
  })
})

describe('isArranged', () => {
  const tabs = [tab(1, 1, 0), tab(2, 1, 1)]
  it.each([
    { order: [], want: false },
    { order: [1, 2], want: false }, // saved, but the same as the tab strip
    { order: [2, 1], want: true },
    { order: [9, 8], want: false }, // only closed tabs
  ])('$order → $want', ({ order, want }) => {
    expect(isArranged(tabs, order)).toBe(want)
  })
})
