import type { TabInfo } from './tab.ts'

/** Tabs of one tab group (or ungrouped tabs) that sit next to each other. */
export type TabSection = { groupId: number; tabs: TabInfo[] }

export type WindowOverview = { windowId: number; sections: TabSection[] }

/**
 * Arranges tabs the way the tab strip shows them: by window, in tab order,
 * with each run of tabs from one group (or with no group) as a section.
 * The browser keeps a group's tabs together, so each group is one section.
 */
export function overviewOf(tabs: readonly TabInfo[]): WindowOverview[] {
  const windows = new Map<number, TabInfo[]>()
  for (const tab of tabs) {
    windows.set(tab.windowId, [...(windows.get(tab.windowId) ?? []), tab])
  }
  return [...windows].map(([windowId, windowTabs]) => {
    const sections: TabSection[] = []
    for (const tab of windowTabs.toSorted((a, b) => a.index - b.index)) {
      const last = sections.at(-1)
      if (last && last.groupId === tab.groupId) last.tabs.push(tab)
      else sections.push({ groupId: tab.groupId, tabs: [tab] })
    }
    return { windowId, sections }
  })
}
