import type {
  SettingsSource,
  SessionRepository,
  ActivityRepository,
  ValueStore,
} from '../../src/background/ports.ts'
import { parsePlaceholder } from '../../src/core/placeholder.ts'
import type { GroupInfo, SavedSession } from '../../src/core/sessions.ts'
import {
  defaultSettings,
  normalizeSettings,
  type Settings,
} from '../../src/core/settings.ts'
import type { TabInfo } from '../../src/core/tab.ts'
import type { Activity } from '../../src/platform/activity-store.ts'
import type { Browser } from '../../src/platform/browser.ts'

export const testOrigin = 'chrome-extension://abc/'
export const testPlaceholderBase = `${testOrigin}ui/suspended/suspended.html`

/** An in-memory browser that behaves like Chromium where it matters. */
export class FakeBrowser implements Browser {
  tabs: TabInfo[] = []
  /** The page each tab was on before its current one, for goBack. */
  private previous = new Map<
    number,
    Pick<TabInfo, 'url' | 'title' | 'placeholder' | 'suspendedAt'>
  >()
  private nextId = 100
  focused: number | null = null
  /** [newId, oldId] for every discard, like tabs.onReplaced. */
  replaced: [number, number][] = []

  byUrl(url: string): TabInfo {
    const tab = this.tabs.find((t) => t.url === url)
    if (!tab) throw new Error(`no tab with `)
    return tab
  }

  addTab(overrides: Partial<TabInfo> = {}): TabInfo {
    const tab: TabInfo = {
      id: this.nextId++,
      windowId: 1,
      index: this.tabs.length,
      url: `https://site${this.nextId}.com/`,
      title: `Site ${this.nextId}`,
      active: false,
      pinned: false,
      audible: false,
      discarded: false,
      placeholder: false,
      suspendedAt: null,
      groupId: -1,
      autoDiscardable: true,
      ...overrides,
    }
    this.tabs.push(tab)
    this.reindex()
    return { ...tab } // a copy, like the real API: ids in it may go stale
  }

  /** Like the browser, tab positions count from 0 in each window. */
  private reindex(): void {
    const next = new Map<number, number>()
    for (const tab of this.tabs) {
      tab.index = next.get(tab.windowId) ?? 0
      next.set(tab.windowId, tab.index + 1)
    }
  }

  groups = new Map<number, GroupInfo>()
  private nextGroupId = 1

  async queryTabs(
    query: { windowId?: number; groupId?: number } = {},
  ): Promise<TabInfo[]> {
    return this.tabs
      .filter(
        (t) =>
          (query.windowId === undefined || t.windowId === query.windowId) &&
          (query.groupId === undefined || t.groupId === query.groupId),
      )
      .map((t) => ({ ...t }))
  }

  /** Video positions by tab id, as the page would report them. */
  videoTimes = new Map<number, number>()

  async videoTime(tabId: number): Promise<number | null> {
    return this.videoTimes.get(tabId) ?? null
  }

  async getGroup(id: number): Promise<GroupInfo | null> {
    return this.groups.get(id) ?? null
  }

  async groupTabs(
    tabIds: number[],
    _windowId: number,
    group: GroupInfo,
  ): Promise<void> {
    const id = this.nextGroupId++
    this.groups.set(id, group)
    for (const tab of this.tabs) if (tabIds.includes(tab.id)) tab.groupId = id
  }

  async getTab(id: number): Promise<TabInfo | null> {
    const tab = this.tabs.find((t) => t.id === id)
    return tab ? { ...tab } : null
  }

  async discard(id: number): Promise<boolean> {
    const tab = this.tabs.find((t) => t.id === id)
    // Chromium refuses to discard the tab in front.
    if (!tab || tab.active) return false
    tab.discarded = true
    // Chromium gives a discarded tab a new id (and fires tabs.onReplaced).
    tab.id = this.nextId++
    this.replaced.push([tab.id, id])
    const previous = this.previous.get(id)
    if (previous) this.previous.set(tab.id, previous)
    return true
  }

  async navigate(id: number, url: string): Promise<boolean> {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return false
    this.previous.set(id, {
      url: tab.url,
      title: tab.title,
      placeholder: tab.placeholder,
      suspendedAt: tab.suspendedAt,
    })
    // Like ChromeBrowser, a tab showing the suspended-tab page reports the
    // page it stands for.
    const page = parsePlaceholder(url, testPlaceholderBase)
    tab.url = page?.url ?? url
    tab.title = page?.title ?? ''
    tab.placeholder = page !== null
    tab.suspendedAt = page?.since ?? null
    tab.discarded = false
    return true
  }

  async goBack(id: number): Promise<boolean> {
    const tab = this.tabs.find((t) => t.id === id)
    const previous = this.previous.get(id)
    // A discarded tab's history isn't loaded, so Chromium refuses.
    if (!tab || !previous || tab.discarded) return false
    Object.assign(tab, previous)
    this.previous.delete(id)
    return true
  }

  async reload(id: number): Promise<void> {
    const tab = this.tabs.find((t) => t.id === id)
    if (tab) tab.discarded = false
  }

  /** Fake pages load instantly. */
  async waitForLoad(): Promise<boolean> {
    return true
  }

  async waitForIcon(): Promise<boolean> {
    return true
  }

  // Fake tabs know their address from the start, so this is a plain discard.
  discardWhenCommitted(id: number): Promise<boolean> {
    return this.discard(id)
  }

  async activate(id: number): Promise<void> {
    const tab = this.tabs.find((t) => t.id === id)!
    for (const t of this.tabs)
      if (t.windowId === tab.windowId) t.active = t.id === id
    tab.discarded = false // opening a suspended tab reloads it
  }

  async createTab(options: {
    url: string
    windowId?: number
    active: boolean
  }): Promise<TabInfo> {
    const page = parsePlaceholder(options.url, testPlaceholderBase)
    const tab = this.addTab({
      url: page?.url ?? options.url,
      title: page?.title ?? '',
      placeholder: page !== null,
      suspendedAt: page?.since ?? null,
      windowId: options.windowId ?? 1,
    })
    if (options.active) await this.activate(tab.id)
    return { ...tab }
  }

  async removeTabs(ids: number[]): Promise<void> {
    this.tabs = this.tabs.filter((t) => !ids.includes(t.id))
    this.reindex()
  }

  async createWindow(
    url: string,
  ): Promise<{ windowId: number; tabId: number }> {
    const windowId = Math.max(0, ...this.tabs.map((t) => t.windowId)) + 1
    const tab = this.addTab({ url, windowId, active: true })
    return { windowId, tabId: tab.id }
  }

  async focusWindow(id: number): Promise<void> {
    this.focused = id
  }
}

export class MemorySettings implements SettingsSource {
  value: Settings
  constructor(overrides: Partial<Settings> = {}) {
    this.value = { ...defaultSettings, ...overrides }
  }
  async get(): Promise<Settings> {
    return this.value
  }
  async update(patch: Partial<Settings>): Promise<Settings> {
    this.value = normalizeSettings({ ...this.value, ...patch })
    return this.value
  }
}

/** Behaves like SessionStore, including deleting lists left empty. */
export class MemorySessions implements SessionRepository {
  items = new Map<string, SavedSession>()
  async list(): Promise<SavedSession[]> {
    return [...this.items.values()]
  }
  async get(id: string): Promise<SavedSession | null> {
    return this.items.get(id) ?? null
  }
  async add(sessions: readonly SavedSession[]): Promise<void> {
    for (const s of sessions) this.items.set(s.id, s)
  }
  async update(
    id: string,
    change: (s: SavedSession) => SavedSession | null,
  ): Promise<SavedSession | null> {
    const current = this.items.get(id)
    if (!current) return null
    const next = change(current)
    if (!next || next.tabs.length === 0) {
      this.items.delete(id)
      return null
    }
    this.items.set(id, next)
    return next
  }
  async remove(id: string): Promise<void> {
    this.items.delete(id)
  }
}

export class MemoryActivity implements ActivityRepository {
  value: Activity = { lastActive: {}, frontTab: {}, paused: [] }
  async read(): Promise<Activity> {
    return structuredClone(this.value)
  }
  async update(change: (a: Activity) => void): Promise<void> {
    change(this.value)
  }
}

/** A clock the test moves by hand. */
export class Clock {
  time = 1_000_000
  now = () => this.time
  advanceMinutes(minutes: number): void {
    this.time += minutes * 60_000
  }
}

export class MemoryValue<T> implements ValueStore<T> {
  value: T | undefined
  async get(): Promise<T | undefined> {
    return this.value
  }
  async set(value: T): Promise<void> {
    this.value = value
  }
  async update(change: (value: T | undefined) => T): Promise<void> {
    this.value = change(this.value)
  }
}
