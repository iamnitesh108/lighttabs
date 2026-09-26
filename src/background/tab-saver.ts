import { unusedSuspendedTabs } from '../core/auto-save.ts'
import { plural } from '../core/format.ts'
import type { GroupInfo, SavedSession, TabToSave } from '../core/sessions.ts'
import { newSession, tabsWithGroups, withoutTab } from '../core/sessions.ts'
import type { TabInfo } from '../core/tab.ts'
import { parseImport } from '../core/transfer.ts'
import { isSaveableUrl } from '../core/urls.ts'
import type { Browser } from '../platform/browser.ts'
import { UserError } from '../shared/messages.ts'
import type { Pages } from './pages.ts'
import type { SessionRepository, SettingsSource } from './ports.ts'

type Dependencies = {
  browser: Browser
  sessions: SessionRepository
  settings: SettingsSource
  pages: Pages
  now: () => number
  makeId: () => string
}

/**
 * Saves tabs into lists and closes them (their memory is fully released),
 * and brings them back later.
 */
export class TabSaver {
  private readonly deps: Dependencies

  constructor(deps: Dependencies) {
    this.deps = deps
  }

  /** Saves and closes a window's tabs (pinned ones stay, if the user wants that). */
  async saveWindow(windowId: number): Promise<number> {
    const tabs = await this.deps.browser.queryTabs({ windowId })
    return this.saveAndClose(tabs, windowId)
  }

  /** Saves the tabs of every window into one list. */
  async saveAllWindows(windowId: number): Promise<number> {
    const tabs = await this.deps.browser.queryTabs()
    return this.saveAndClose(tabs, windowId)
  }

  async saveTab(tabId: number): Promise<number> {
    const tab = await this.deps.browser.getTab(tabId)
    if (!tab) throw new UserError('That tab is already closed.')
    return this.saveAndClose([tab], tab.windowId, { includePinned: true })
  }

  /** Saves a tab group into a list named after it, and closes its tabs. */
  async saveGroup(groupId: number, windowId: number): Promise<number> {
    const { browser } = this.deps
    const group = await browser.getGroup(groupId)
    if (!group) throw new UserError('That tab group no longer exists.')
    const tabs = await browser.queryTabs({ groupId })
    return this.saveAndClose(tabs, windowId, {
      includePinned: true,
      name: group.title,
    })
  }

  private async saveAndClose(
    tabs: readonly TabInfo[],
    windowId: number,
    options: { includePinned?: boolean; name?: string } = {},
  ): Promise<number> {
    const { browser, sessions, pages, now, makeId } = this.deps
    const settings = await this.deps.settings.get()

    const keepOpen = (t: TabInfo) =>
      !options.includePinned && settings.keepPinnedWhenSaving && t.pinned
    const ownPage = (t: TabInfo) => pages.isOwnPage(t.url)
    const toSave = tabs.filter(
      (t) => !keepOpen(t) && isSaveableUrl(t.url, pages.origin),
    )
    if (toSave.length === 0)
      throw new UserError('There are no tabs to save here.')

    const session = newSession(await this.withGroups(toSave), {
      now: now(),
      makeId,
      skipDuplicates: settings.skipDuplicatesWhenSaving,
      name: options.name,
    })
    await sessions.add([session])

    // Close what was saved, and empty new-tab pages with it. The saved page
    // (or a new tab) opens first, so the window doesn't close with its last tab.
    const toClose = tabs
      .filter((t) => !keepOpen(t) && !ownPage(t))
      .map((t) => t.id)
    if (settings.openSavedPageAfterSaving) {
      await pages.showSaved(windowId)
    } else {
      const remaining = (await browser.queryTabs({ windowId })).filter(
        (t) => !toClose.includes(t.id),
      )
      if (remaining.length === 0)
        await browser.createTab({ url: 'about:blank', windowId, active: true })
    }
    await browser.removeTabs(toClose)
    return session.tabs.length
  }

  /**
   * Saves suspended tabs that haven't been opened for a while into one list
   * and closes them. Runs once a day; returns how many were saved.
   */
  async saveUnusedTabs(): Promise<number> {
    const { browser, sessions, now, makeId } = this.deps
    const settings = await this.deps.settings.get()
    const unused = unusedSuspendedTabs(
      await browser.queryTabs(),
      now(),
      settings,
    )
    if (unused.length === 0) return 0

    const days = settings.saveSuspendedAfterDays
    const session = newSession(await this.withGroups(unused), {
      now: now(),
      makeId,
      skipDuplicates: settings.skipDuplicatesWhenSaving,
      name: `Not opened for ${plural(days, 'day')}`,
    })
    await sessions.add([session])
    await browser.removeTabs(unused.map((t) => t.id))
    return unused.length
  }

  /**
   * Opens a list's tabs again. With "restore without loading" they appear
   * in the tab strip but use no memory until opened, so restoring 100 tabs
   * doesn't freeze the browser: they open as suspended-tab pages (with
   * click to load), or are discarded as soon as they know their address.
   */
  async restoreSession(
    sessionId: string,
    windowId: number,
    newWindow: boolean,
  ): Promise<void> {
    const { browser, sessions, pages, now } = this.deps
    const settings = await this.deps.settings.get()
    const session = await sessions.get(sessionId)
    if (!session) throw new UserError('This list no longer exists.')

    let rest = session.tabs
    let target = windowId
    if (newWindow) {
      const [first, ...others] = session.tabs
      target = (await browser.createWindow(first.url)).windowId
      rest = others
    }
    const restoredCount = session.tabs.length
    const asPlaceholders =
      settings.restoreWithoutLoading && settings.clickToLoad
    const created: number[] = []
    for (const tab of rest) {
      const opened = await browser.createTab({
        url: asPlaceholders
          ? pages.placeholderFor({ ...tab, since: now() })
          : tab.url,
        windowId: target,
        active: false,
      })
      created.push(opened.id)
    }
    // Grouped before discarding: discarding can give a tab a new id.
    await this.regroup(session, target, restoredCount)
    // Discarded in parallel, so one slow site doesn't hold up the rest.
    if (settings.restoreWithoutLoading && !asPlaceholders) {
      await Promise.all(created.map((id) => browser.discardWhenCommitted(id)))
    }

    if (!settings.keepListsAfterRestoring && !session.locked)
      await sessions.remove(sessionId)
  }

  /** Opens one saved tab in the background, and takes it off the list (unless locked). */
  async restoreTab(
    sessionId: string,
    tabId: string,
    windowId: number,
  ): Promise<void> {
    const settings = await this.deps.settings.get()
    const session = await this.deps.sessions.get(sessionId)
    const tab = session?.tabs.find((t) => t.id === tabId)
    if (!session || !tab)
      throw new UserError('This tab is no longer in the list.')

    await this.deps.browser.createTab({ url: tab.url, windowId, active: false })
    if (!settings.keepListsAfterRestoring && !session.locked) {
      await this.deps.sessions.update(sessionId, (s) => withoutTab(s, tabId))
    }
  }

  async removeTab(sessionId: string, tabId: string): Promise<void> {
    await this.deps.sessions.update(sessionId, (s) => {
      if (s.locked)
        throw new UserError('Unlock the list to remove tabs from it.')
      return withoutTab(s, tabId)
    })
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.deps.sessions.get(sessionId)
    if (session?.locked)
      throw new UserError('Unlock the list before deleting it.')
    await this.deps.sessions.remove(sessionId)
  }

  async renameSession(sessionId: string, name: string): Promise<void> {
    await this.deps.sessions.update(sessionId, (s) => ({
      ...s,
      name: name.trim().slice(0, 100),
    }))
  }

  async lockSession(sessionId: string, locked: boolean): Promise<void> {
    await this.deps.sessions.update(sessionId, (s) => ({ ...s, locked }))
  }

  /** The tabs as they'll be saved, with the name and colour of their group. */
  private async withGroups(tabs: readonly TabInfo[]): Promise<TabToSave[]> {
    const ids = [...new Set(tabs.map((t) => t.groupId))].filter((id) => id >= 0)
    const found = new Map<number, GroupInfo | null>()
    for (const id of ids) found.set(id, await this.deps.browser.getGroup(id))
    return tabs.map((tab) => {
      const group = found.get(tab.groupId)
      return {
        url: tab.url,
        title: tab.title,
        ...(group && { group: { ...group, key: tab.groupId } }),
      }
    })
  }

  /**
   * Puts restored tabs back into their groups. The restored tabs are the
   * last ones of the window, in list order; they're looked up again right
   * before grouping, because a restored tab's id can change when it's
   * discarded.
   */
  private async regroup(
    session: SavedSession,
    windowId: number,
    count: number,
  ): Promise<void> {
    if (!session.groups?.length) return
    const { browser } = this.deps
    const restored = (await browser.queryTabs({ windowId }))
      .toSorted((a, b) => a.index - b.index)
      .slice(-count)
    const entries = tabsWithGroups(session)
    for (const group of session.groups) {
      const ids = entries.flatMap(({ group: g }, i) =>
        g?.id === group.id && restored[i] ? [restored[i].id] : [],
      )
      const { title, color, collapsed } = group
      try {
        await browser.groupTabs(ids, windowId, { title, color, collapsed })
      } catch (error) {
        // A tab closed or changed meanwhile: the tabs stay, just ungrouped.
        console.warn('LightTabs: could not regroup tabs', error)
      }
    }
  }

  /** Adds the lists from a LightTabs backup or a OneTab export. */
  async import(text: string): Promise<{ lists: number; tabs: number }> {
    let imported: SavedSession[]
    try {
      imported = parseImport(text, {
        now: this.deps.now(),
        makeId: this.deps.makeId,
      })
    } catch (error) {
      throw new UserError(
        error instanceof Error ? error.message : String(error),
      )
    }
    await this.deps.sessions.add(imported)
    return {
      lists: imported.length,
      tabs: imported.reduce((n, s) => n + s.tabs.length, 0),
    }
  }
}
