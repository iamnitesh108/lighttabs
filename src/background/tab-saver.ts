import type { SavedSession, TabToSave } from '../core/sessions.ts'
import { newSession, withoutTab } from '../core/sessions.ts'
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

  private async saveAndClose(
    tabs: readonly TabInfo[],
    windowId: number,
    options: { includePinned?: boolean } = {},
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

    const session = newSession(toSave.map(toTabToSave), {
      now: now(),
      makeId,
      skipDuplicates: settings.skipDuplicatesWhenSaving,
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
    const { browser, sessions, pages } = this.deps
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
    const asPlaceholders =
      settings.restoreWithoutLoading && settings.clickToLoad
    const created: number[] = []
    for (const tab of rest) {
      const opened = await browser.createTab({
        url: asPlaceholders ? pages.placeholderFor(tab) : tab.url,
        windowId: target,
        active: false,
      })
      created.push(opened.id)
    }
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

function toTabToSave(tab: TabInfo): TabToSave {
  return { url: tab.url, title: tab.title }
}
