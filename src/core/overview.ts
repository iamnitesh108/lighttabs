import type { TabInfo } from './tab.ts'

/**
 * One entry of a window in the overview: a tab that isn't in a group, or a
 * whole tab group with its tabs.
 */
export type OverviewItem =
  | { kind: 'tab'; key: string; tab: TabInfo }
  | { kind: 'group'; key: string; groupId: number; tabs: TabInfo[] }

export type WindowOverview = { windowId: number; items: OverviewItem[] }

/** The overview's own order, where cards or groups were moved by hand. */
export type Arrangement = {
  /** Tab ids; only the order of tabs within one group counts. */
  cards: number[]
  /** Item keys; only the order within one window counts. */
  items: string[]
}

export const noArrangement: Arrangement = { cards: [], items: [] }

/** Where the arrangement is kept (storage.session). */
export const arrangementKey = 'overview-arrangement'

export function tabKey(tabId: number): string {
  return `tab:${tabId}`
}

export function groupKey(groupId: number): string {
  return `group:${groupId}`
}

/**
 * Arranges tabs the way the tab strip shows them: by window, in tab order,
 * each group as one item where its first tab is. The browser keeps a
 * group's tabs together. Then applies what was moved by hand: items within
 * their window, and tabs within their group.
 */
export function overviewOf(
  tabs: readonly TabInfo[],
  arrangement: Arrangement = noArrangement,
): WindowOverview[] {
  const windows = new Map<number, TabInfo[]>()
  for (const tab of tabs) {
    windows.set(tab.windowId, [...(windows.get(tab.windowId) ?? []), tab])
  }
  return [...windows].map(([windowId, windowTabs]) => {
    const items: OverviewItem[] = []
    const groups = new Map<number, TabInfo[]>()
    for (const tab of windowTabs.toSorted((a, b) => a.index - b.index)) {
      if (tab.groupId < 0) {
        items.push({ kind: 'tab', key: tabKey(tab.id), tab })
        continue
      }
      const group = groups.get(tab.groupId)
      if (group) {
        group.push(tab)
        continue
      }
      const groupTabs = [tab]
      groups.set(tab.groupId, groupTabs)
      items.push({
        kind: 'group',
        key: groupKey(tab.groupId),
        groupId: tab.groupId,
        tabs: groupTabs,
      })
    }
    for (const item of items) {
      if (item.kind === 'group')
        item.tabs = arranged(item.tabs, arrangement.cards, (t) => t.id)
    }
    return {
      windowId,
      items: arranged(items, arrangement.items, (i) => i.key),
    }
  })
}

/** Every tab of a window's items, in the order shown. */
export function tabsOf(items: readonly OverviewItem[]): TabInfo[] {
  return items.flatMap((i) => (i.kind === 'tab' ? [i.tab] : i.tabs))
}

/**
 * Puts the items moved by hand in their saved order, in the places they
 * hold now. Items never moved (new tabs, say) stay where the tab strip has
 * them.
 */
export function arranged<T, K>(
  items: readonly T[],
  order: readonly K[],
  key: (item: T) => K,
): T[] {
  const rank = new Map(order.map((k, i) => [k, i]))
  const moved = items
    .filter((item) => rank.has(key(item)))
    .toSorted((a, b) => rank.get(key(a))! - rank.get(key(b))!)
  let next = 0
  return items.map((item) => (rank.has(key(item)) ? moved[next++] : item))
}

/** The saved order after one group (or window) was arranged: these in their new order. */
export function withArranged<K>(order: readonly K[], moved: readonly K[]): K[] {
  const set = new Set(moved)
  return [...order.filter((k) => !set.has(k)), ...moved]
}

/** Whether anything is out of tab strip order. */
export function isArranged(
  tabs: readonly TabInfo[],
  arrangement: Arrangement,
): boolean {
  const ids = (a: Arrangement) =>
    overviewOf(tabs, a)
      .flatMap((w) => tabsOf(w.items))
      .map((t) => t.id)
      .join()
  return ids(arrangement) !== ids(noArrangement)
}

/** Where a card pushed down a row goes: in front of one card, or after one. */
export type Landing<T> = { before: T } | { after: T }

const hole = Symbol('hole')

/**
 * Drops moved into a column of the grid, in the gap above lower: moved
 * takes lower's place, and lower goes one row down (to `landing`: in front
 * of the card that was below it, or after the last card of its run when
 * nothing was). Rows above stay as they are; everything after shifts along.
 * Dropping the card below lower gives a swap.
 */
export function dropInColumn<T>(
  list: readonly T[],
  moved: T,
  lower: T,
  landing: Landing<T>,
): T[] {
  // Marks where moved was, so lower can go there if that's its landing.
  const result: (T | typeof hole)[] = list.map((item) =>
    item === lower ? moved : item === moved ? hole : item,
  )
  const anchor = 'before' in landing ? landing.before : landing.after
  const at = result.indexOf(anchor === moved ? hole : anchor)
  result.splice('before' in landing ? at : at + 1, 0, lower)
  return result.filter((item): item is T => item !== hole)
}
