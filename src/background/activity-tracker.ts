import type { TabInfo } from '../core/tab.ts'
import type { ActivityRepository } from './ports.ts'

/** What the suspender needs to know about tab activity at one moment. */
export type ActivitySnapshot = {
  lastActive(tabId: number): number
  isPaused(tabId: number): boolean
}

/**
 * Remembers when each tab was last in front. A background tab's idle time
 * starts when you *leave* it, so switching tabs updates both the tab you
 * leave and the one you open.
 */
export class ActivityTracker {
  private readonly store: ActivityRepository
  private readonly now: () => number

  constructor(store: ActivityRepository, now: () => number) {
    this.store = store
    this.now = now
  }

  /** Returns the tab that was in front of the window before, if known. */
  async tabActivated(
    tabId: number,
    windowId: number,
  ): Promise<number | undefined> {
    const now = this.now()
    let previous: number | undefined
    await this.store.update((a) => {
      previous = a.frontTab[windowId]
      if (previous !== undefined) a.lastActive[previous] = now
      a.lastActive[tabId] = now
      a.frontTab[windowId] = tabId
    })
    return previous === tabId ? undefined : previous
  }

  /** Loading a page again (or a new one) counts as using the tab. */
  tabNavigated(tabId: number): Promise<void> {
    const now = this.now()
    return this.store.update((a) => {
      a.lastActive[tabId] = now
    })
  }

  tabClosed(tabId: number): Promise<void> {
    return this.store.update((a) => {
      delete a.lastActive[tabId]
      a.paused = a.paused.filter((id) => id !== tabId)
      for (const [windowId, front] of Object.entries(a.frontTab)) {
        if (front === tabId) delete a.frontTab[windowId]
      }
    })
  }

  /** The browser swaps a tab for a prerendered one with a new id: keep its history. */
  tabReplaced(addedId: number, removedId: number): Promise<void> {
    return this.store.update((a) => {
      const last = a.lastActive[removedId]
      if (last !== undefined) a.lastActive[addedId] = last
      delete a.lastActive[removedId]
      if (a.paused.includes(removedId))
        a.paused = [...a.paused.filter((id) => id !== removedId), addedId]
    })
  }

  /**
   * Starts every tab's clock now: after the browser starts (tab ids are all
   * new) or after install. Without this, restored tabs would be suspended
   * the moment the timer first runs.
   */
  reset(tabs: readonly TabInfo[]): Promise<void> {
    const now = this.now()
    return this.store.update((a) => {
      a.lastActive = Object.fromEntries(tabs.map((t) => [t.id, now]))
      a.frontTab = Object.fromEntries(
        tabs.filter((t) => t.active).map((t) => [t.windowId, t.id]),
      )
      a.paused = a.paused.filter((id) => tabs.some((t) => t.id === id))
    })
  }

  /**
   * A snapshot for one decision round. Tabs seen for the first time start
   * their clock now (and are remembered), so no tab is suspended early.
   */
  async snapshot(tabs: readonly TabInfo[]): Promise<ActivitySnapshot> {
    const now = this.now()
    const activity = await this.store.read()
    const unseen = tabs
      .filter((t) => activity.lastActive[t.id] === undefined)
      .map((t) => t.id)
    if (unseen.length > 0) {
      await this.store.update((a) => {
        for (const id of unseen) a.lastActive[id] ??= now
      })
    }
    const paused = new Set(activity.paused)
    return {
      lastActive: (id) => activity.lastActive[id] ?? now,
      isPaused: (id) => paused.has(id),
    }
  }

  /** Turns "don't suspend this tab" on or off; returns the new state. */
  async togglePause(tabId: number): Promise<boolean> {
    let paused = false
    await this.store.update((a) => {
      paused = !a.paused.includes(tabId)
      a.paused = paused
        ? [...a.paused, tabId]
        : a.paused.filter((id) => id !== tabId)
    })
    return paused
  }
}
