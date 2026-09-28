import type { TabInfo } from './tab.ts'

/** Tabs of one tab group (or ungrouped tabs) that sit next to each other. */
export type TabSection = { groupId: number; tabs: TabInfo[] }

export type WindowOverview = { windowId: number; sections: TabSection[] }

/** Where the order of cards arranged by hand is kept (storage.session). */
export const cardOrderKey = 'overview-order'

/**
 * Arranges tabs the way the tab strip shows them: by window, in tab order,
 * with each run of tabs from one group (or with no group) as a section.
 * The browser keeps a group's tabs together, so each group is one section.
 * Cards moved by hand keep their order within their section.
 */
export function overviewOf(
  tabs: readonly TabInfo[],
  order: readonly number[] = [],
): WindowOverview[] {
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
    for (const section of sections) section.tabs = arranged(section.tabs, order)
    return { windowId, sections }
  })
}

/**
 * Puts the tabs arranged by hand in their saved order, in the places they
 * hold now. Tabs never arranged (new ones, say) stay where the tab strip
 * has them.
 */
export function arranged(
  tabs: readonly TabInfo[],
  order: readonly number[],
): TabInfo[] {
  const rank = new Map(order.map((id, i) => [id, i]))
  const moved = tabs
    .filter((t) => rank.has(t.id))
    .toSorted((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  let next = 0
  return tabs.map((t) => (rank.has(t.id) ? moved[next++] : t))
}

/** The saved order after one section's cards were arranged: ids in their new order. */
export function withArranged(
  order: readonly number[],
  ids: readonly number[],
): number[] {
  const section = new Set(ids)
  return [...order.filter((id) => !section.has(id)), ...ids]
}

/** Whether any card is out of tab strip order. */
export function isArranged(
  tabs: readonly TabInfo[],
  order: readonly number[],
): boolean {
  const ids = (o: readonly number[]) =>
    overviewOf(tabs, o)
      .flatMap((w) => w.sections.flatMap((s) => s.tabs))
      .map((t) => t.id)
      .join()
  return order.length > 0 && ids(order) !== ids([])
}
