import type { Arrangement } from '../core/overview.ts'
import {
  groupKey,
  noArrangement,
  tabKey,
  withArranged,
} from '../core/overview.ts'
import type { Browser } from '../platform/browser.ts'
import type { ValueStore } from './ports.ts'

/**
 * The overview's own order of cards and groups, when moved by hand. It
 * lives outside the page so it survives closing the overview, and here so
 * it can follow a tab whose id changes when it's suspended.
 */
export class OverviewOrder {
  private readonly browser: Browser
  private readonly store: ValueStore<Arrangement>

  constructor(browser: Browser, store: ValueStore<Arrangement>) {
    this.browser = browser
    this.store = store
  }

  /** Saves one group's cards in their new order. */
  arrangeCards(tabIds: readonly number[]): Promise<void> {
    return this.arrange((a) => ({
      ...a,
      cards: withArranged(a.cards, tabIds),
    }))
  }

  /** Saves the order of one window's tabs and groups. */
  arrangeItems(keys: readonly string[]): Promise<void> {
    return this.arrange((a) => ({
      ...a,
      items: withArranged(a.items, keys),
    }))
  }

  /** Back to tab strip order. */
  reset(): Promise<void> {
    return this.store.update(() => noArrangement)
  }

  /** A suspended tab gets a new id: it keeps its place. */
  async tabReplaced(addedId: number, removedId: number): Promise<void> {
    const saved = await this.store.get()
    const old = tabKey(removedId)
    // Most tabs were never moved: then there's nothing to write.
    if (!saved?.cards.includes(removedId) && !saved?.items.includes(old)) return
    await this.store.update((a = noArrangement) => ({
      cards: a.cards.map((id) => (id === removedId ? addedId : id)),
      items: a.items.map((k) => (k === old ? tabKey(addedId) : k)),
    }))
  }

  /** Applies a change, and forgets tabs and groups that have closed. */
  private async arrange(
    change: (arrangement: Arrangement) => Arrangement,
  ): Promise<void> {
    const tabs = await this.browser.queryTabs()
    const open = new Set(tabs.map((t) => t.id))
    const keys = new Set([
      ...tabs.map((t) => tabKey(t.id)),
      ...tabs.map((t) => groupKey(t.groupId)),
    ])
    await this.store.update((saved = noArrangement) => {
      const next = change(saved)
      return {
        cards: next.cards.filter((id) => open.has(id)),
        items: next.items.filter((k) => keys.has(k)),
      }
    })
  }
}
