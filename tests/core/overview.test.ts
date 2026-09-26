import { describe, expect, it } from 'vitest'
import { overviewOf } from '../../src/core/overview.ts'
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
