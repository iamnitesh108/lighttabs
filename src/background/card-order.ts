import { withArranged } from '../core/overview.ts'
import type { Browser } from '../platform/browser.ts'
import type { ValueStore } from './ports.ts'

/**
 * The order of the overview's cards, when arranged by hand. It lives
 * outside the page so it survives closing the overview, and here so it can
 * follow a tab whose id changes when it's suspended.
 */
export class CardOrder {
  private readonly browser: Browser
  private readonly store: ValueStore<number[]>

  constructor(browser: Browser, store: ValueStore<number[]>) {
    this.browser = browser
    this.store = store
  }

  /** Saves one section's cards in their new order; forgets closed tabs. */
  async arrange(tabIds: readonly number[]): Promise<void> {
    const open = new Set((await this.browser.queryTabs()).map((t) => t.id))
    await this.store.update((order) =>
      withArranged(order ?? [], tabIds).filter((id) => open.has(id)),
    )
  }

  /** Back to tab strip order. */
  reset(): Promise<void> {
    return this.store.update(() => [])
  }

  /** A suspended tab gets a new id: it keeps its place. */
  async tabReplaced(addedId: number, removedId: number): Promise<void> {
    // Most tabs were never arranged: then there's nothing to write.
    if (!(await this.store.get())?.includes(removedId)) return
    await this.store.update((order) =>
      (order ?? []).map((id) => (id === removedId ? addedId : id)),
    )
  }
}
