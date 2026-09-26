import { parsePlaceholder } from '../core/placeholder.ts'
import type { GroupInfo } from '../core/sessions.ts'
import { groupColors } from '../core/sessions.ts'
import type { TabInfo } from '../core/tab.ts'

/**
 * The browser tab and window operations the extension uses. The background
 * code depends on this interface, so tests use a fake instead of chrome.*.
 */
export interface Browser {
  queryTabs(query?: { windowId?: number; groupId?: number }): Promise<TabInfo[]>
  getTab(id: number): Promise<TabInfo | null>
  discard(id: number): Promise<boolean>
  /**
   * Discards a tab that was just created, once it knows its address.
   * Discarding earlier leaves an empty tab that reopens blank. Resolves false
   * (tab left loaded, the safe outcome) if the page never starts loading.
   */
  discardWhenCommitted(id: number): Promise<boolean>
  /** Opens an address in the tab; false if the tab is gone. */
  navigate(id: number, url: string): Promise<boolean>
  /** Goes one page back in the tab's history; false if there's no page to go back to. */
  goBack(id: number): Promise<boolean>
  reload(id: number): Promise<void>
  /**
   * Resolves when the tab next finishes loading: true when loaded, false if it
   * closed or took longer than the timeout. Call it before starting the load.
   */
  waitForLoad(id: number, timeoutMs?: number): Promise<boolean>
  /** Like waitForLoad, for the tab's icon changing. */
  waitForIcon(id: number, timeoutMs?: number): Promise<boolean>
  activate(id: number): Promise<void>
  createTab(options: {
    url: string
    windowId?: number
    active: boolean
    index?: number
  }): Promise<TabInfo>
  removeTabs(ids: number[]): Promise<void>
  getGroup(id: number): Promise<GroupInfo | null>
  /** Puts tabs of one window into a new group. */
  groupTabs(tabIds: number[], windowId: number, group: GroupInfo): Promise<void>
  createWindow(url: string): Promise<{ windowId: number; tabId: number }>
  focusWindow(id: number): Promise<void>
}

export class ChromeBrowser implements Browser {
  /** The suspended-tab page, to recognise tabs that show it. */
  private readonly placeholderBase: string

  constructor(placeholderBase: string) {
    this.placeholderBase = placeholderBase
  }

  async queryTabs(
    query: { windowId?: number; groupId?: number } = {},
  ): Promise<TabInfo[]> {
    const tabs = await chrome.tabs.query({ ...query, windowType: 'normal' })
    return tabs.flatMap((t) => (t.id === undefined ? [] : [this.toTabInfo(t)]))
  }

  async getTab(id: number): Promise<TabInfo | null> {
    try {
      return this.toTabInfo(await chrome.tabs.get(id))
    } catch {
      return null // closed meanwhile
    }
  }

  async discard(id: number): Promise<boolean> {
    try {
      const tab = await chrome.tabs.discard(id)
      return tab?.discarded === true
    } catch {
      // The browser refuses some tabs (for example one still loading its
      // first page); leaving them loaded is the safe outcome.
      return false
    }
  }

  async discardWhenCommitted(id: number, timeoutMs = 15_000): Promise<boolean> {
    const committed = await new Promise<boolean>((resolve) => {
      const finish = (result: boolean) => {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(onUpdated)
        chrome.tabs.onRemoved.removeListener(onRemoved)
        resolve(result)
      }
      const onUpdated = (
        tabId: number,
        _change: unknown,
        tab: chrome.tabs.Tab,
      ) => {
        if (tabId === id && tab.url) finish(true)
      }
      const onRemoved = (tabId: number) => {
        if (tabId === id) finish(false)
      }
      const timer = setTimeout(() => finish(false), timeoutMs)
      chrome.tabs.onUpdated.addListener(onUpdated)
      chrome.tabs.onRemoved.addListener(onRemoved)
      // It may have committed before the listeners were added.
      chrome.tabs.get(id).then(
        (tab) => tab.url && finish(true),
        () => finish(false),
      )
    })
    return committed && this.discard(id)
  }

  async navigate(id: number, url: string): Promise<boolean> {
    try {
      await chrome.tabs.update(id, { url })
      return true
    } catch {
      return false // closed meanwhile
    }
  }

  async goBack(id: number): Promise<boolean> {
    try {
      await chrome.tabs.goBack(id)
      return true
    } catch {
      // No earlier page, or the tab is discarded (its history isn't loaded).
      return false
    }
  }

  async reload(id: number): Promise<void> {
    await chrome.tabs.reload(id)
  }

  waitForLoad(id: number, timeoutMs = 30_000): Promise<boolean> {
    return this.waitForChange(
      id,
      (change) => change.status === 'complete',
      timeoutMs,
    )
  }

  waitForIcon(id: number, timeoutMs = 5_000): Promise<boolean> {
    return this.waitForChange(id, (change) => !!change.favIconUrl, timeoutMs)
  }

  private waitForChange(
    id: number,
    matches: (change: chrome.tabs.OnUpdatedInfo) => boolean,
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const finish = (result: boolean) => {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(onUpdated)
        chrome.tabs.onRemoved.removeListener(onRemoved)
        resolve(result)
      }
      const onUpdated = (tabId: number, change: chrome.tabs.OnUpdatedInfo) => {
        if (tabId === id && matches(change)) finish(true)
      }
      const onRemoved = (tabId: number) => {
        if (tabId === id) finish(false)
      }
      const timer = setTimeout(() => finish(false), timeoutMs)
      chrome.tabs.onUpdated.addListener(onUpdated)
      chrome.tabs.onRemoved.addListener(onRemoved)
    })
  }

  async activate(id: number): Promise<void> {
    await chrome.tabs.update(id, { active: true })
  }

  async createTab(options: {
    url: string
    windowId?: number
    active: boolean
    index?: number
  }): Promise<TabInfo> {
    return this.toTabInfo(await chrome.tabs.create(options))
  }

  async removeTabs(ids: number[]): Promise<void> {
    if (ids.length > 0) await chrome.tabs.remove(ids)
  }

  async getGroup(id: number): Promise<GroupInfo | null> {
    try {
      const group = await chrome.tabGroups.get(id)
      return {
        title: group.title ?? '',
        color: groupColors.find((c) => c === group.color) ?? 'grey',
        collapsed: group.collapsed,
      }
    } catch {
      return null // no longer exists
    }
  }

  async groupTabs(
    tabIds: number[],
    windowId: number,
    group: GroupInfo,
  ): Promise<void> {
    if (tabIds.length === 0) return
    const groupId = await chrome.tabs.group({
      tabIds: tabIds as [number, ...number[]],
      createProperties: { windowId },
    })
    await chrome.tabGroups.update(groupId, group)
  }

  async createWindow(
    url: string,
  ): Promise<{ windowId: number; tabId: number }> {
    const window = await chrome.windows.create({ url, focused: true })
    const tabId = window?.tabs?.[0]?.id
    if (window?.id === undefined || tabId === undefined)
      throw new Error('The window could not be opened')
    return { windowId: window.id, tabId }
  }

  async focusWindow(id: number): Promise<void> {
    await chrome.windows.update(id, { focused: true })
  }

  private toTabInfo(tab: chrome.tabs.Tab): TabInfo {
    // A tab that is navigating reports where it's going: a tab on its way
    // to the suspended-tab page already counts as suspended, and one leaving
    // it no longer does.
    const address = tab.pendingUrl || tab.url || ''
    const page = parsePlaceholder(address, this.placeholderBase)
    return {
      id: tab.id ?? -1,
      windowId: tab.windowId,
      index: tab.index,
      url: page?.url ?? address,
      title: page?.title || tab.title || '',
      active: tab.active,
      pinned: tab.pinned,
      audible: tab.audible ?? false,
      discarded: tab.discarded,
      placeholder: page !== null,
      suspendedAt: page?.since ?? null,
      groupId: tab.groupId,
      autoDiscardable: tab.autoDiscardable,
    }
  }
}
