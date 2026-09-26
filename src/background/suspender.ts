import { runLimited } from '../core/limit.ts'
import { loadLimit, nearestFirst } from '../core/load-order.ts'
import { excludingRule, siteOf } from '../core/sites.ts'
import { suspendBlocker, timeUntilDue } from '../core/suspend-policy.ts'
import type { TabInfo } from '../core/tab.ts'
import { isSuspended } from '../core/tab.ts'
import type { Browser } from '../platform/browser.ts'
import type { TabStatus } from '../shared/messages.ts'
import { UserError } from '../shared/messages.ts'
import type { ActivityTracker } from './activity-tracker.ts'
import type { Pages } from './pages.ts'
import type { SettingsSource } from './ports.ts'

type Dependencies = {
  browser: Browser
  activity: ActivityTracker
  settings: SettingsSource
  pages: Pages
  now: () => number
  isOnline: () => boolean
  cpuCores: number
}

/**
 * Suspended-tab pages shown at the same time. Each one briefly costs about
 * a megabyte in the extension's process, and the process keeps much of its
 * highest use afterwards: showing 60 at once left it 20 MB bigger.
 */
const showPlaceholdersAtOnce = 4

/**
 * Suspends tabs in one of two ways, chosen in the settings:
 *
 * - Click to load (default): the tab shows a small page of this extension
 *   with the site's title and a faded icon, and loads the site only when
 *   that page is clicked. The small page is then discarded too, so it uses
 *   no memory; discarding it also drops the site from the back/forward
 *   cache, which would otherwise keep it in memory for minutes.
 * - The browser's own discarding: the tab keeps the site's address and
 *   reloads as soon as it's opened. Nothing depends on this extension.
 */
export class Suspender {
  private readonly deps: Dependencies

  constructor(deps: Dependencies) {
    this.deps = deps
  }

  /** The timer: suspends every tab that has been in the background long enough. */
  async runTimer(): Promise<number> {
    const { browser, activity, now, isOnline } = this.deps
    const settings = await this.deps.settings.get()
    const tabs = await browser.queryTabs()
    await this.settleAll(tabs)
    if (settings.suspendAfterMinutes === 0) return 0

    const snapshot = await activity.snapshot(tabs)
    const time = now()
    const online = isOnline()

    const due = tabs.filter(
      (tab) =>
        suspendBlocker(
          tab,
          { paused: snapshot.isPaused(tab.id), online },
          settings,
          'auto',
        ) === null &&
        timeUntilDue(snapshot.lastActive(tab.id), time, settings) === 0,
    )
    return this.suspendAll(due, settings.clickToLoad)
  }

  /**
   * Suspends one tab now. With click to load, the tab you're looking at
   * simply shows the suspended-tab page. The browser can't discard the tab
   * in front, so otherwise it first switches to the tab you used before.
   */
  async suspendTab(tabId: number): Promise<void> {
    const { browser, activity } = this.deps
    const settings = await this.deps.settings.get()
    const tab = await browser.getTab(tabId)
    if (!tab) throw new UserError('That tab is already closed.')

    const blocker = suspendBlocker(
      tab,
      { paused: false, online: true },
      settings,
      'single',
    )
    if (blocker === 'already-suspended') return
    if (blocker === 'not-a-web-page')
      throw new UserError("Browser pages can't be suspended.")

    if (tab.active && !settings.clickToLoad) {
      const others = (
        await browser.queryTabs({ windowId: tab.windowId })
      ).filter((t) => t.id !== tab.id)
      if (others.length === 0)
        throw new UserError("It's the only tab in this window.")
      const snapshot = await activity.snapshot(others)
      await browser.activate(pickNextTab(others, snapshot.lastActive).id)
    }
    if (!(await this.suspend(tab, settings.clickToLoad)))
      throw new UserError("The browser didn't allow suspending this tab.")
  }

  /** Suspends the other tabs of a window, respecting the user's exceptions (but not the timer). */
  async suspendOthers(windowId: number): Promise<number> {
    const { browser, activity, isOnline } = this.deps
    const settings = await this.deps.settings.get()
    const tabs = await browser.queryTabs({ windowId })
    const snapshot = await activity.snapshot(tabs)

    const online = isOnline()
    const candidates = tabs.filter(
      (tab) =>
        suspendBlocker(
          tab,
          { paused: snapshot.isPaused(tab.id), online },
          settings,
          'others',
        ) === null,
    )
    return this.suspendAll(candidates, settings.clickToLoad)
  }

  /** The keyboard shortcut: suspends the tab, or loads it if it's suspended. */
  async toggleTab(tabId: number): Promise<void> {
    const tab = await this.deps.browser.getTab(tabId)
    if (tab?.placeholder) await this.unsuspend(tab)
    else await this.suspendTab(tabId)
  }

  async unsuspendTab(tabId: number): Promise<void> {
    const tab = await this.deps.browser.getTab(tabId)
    if (!tab) throw new UserError('That tab is already closed.')
    await this.unsuspend(tab)
  }

  /**
   * Loads every suspended tab of a window, a few at a time (loading them
   * all at once makes each one slow), starting next to the current tab.
   * Returns how many will load; they keep loading after that.
   */
  async unsuspendAll(windowId: number): Promise<{
    count: number
    done: Promise<void>
  }> {
    const { browser } = this.deps
    const all = await browser.queryTabs({ windowId })
    const current = all.find((t) => t.active)?.index ?? 0
    const tabs = nearestFirst(all.filter(isSuspended), current)
    const limit = loadLimit(this.deps.cpuCores)
    const done = runLimited(tabs, limit, async (tab) => {
      const loaded = browser.waitForLoad(tab.id)
      await this.unsuspend(tab)
      await loaded
    })
    return { count: tabs.length, done }
  }

  /**
   * Discards a suspended-tab page that is loaded but not in front: after it
   * has just been shown, when you switch away from it, or when the browser
   * reopened it at startup. Called when the tab's icon changes, because the
   * faded icon must reach the tab strip first (a discarded tab keeps the
   * icon it had).
   */
  async settle(tabId: number): Promise<void> {
    const tab = await this.deps.browser.getTab(tabId)
    if (tab && needsSettling(tab)) await this.deps.browser.discard(tab.id)
  }

  /**
   * Before an update the browser closes every loaded page of this extension,
   * which would close suspended tabs; discarded ones stay. Returns whether
   * the update can happen now (no suspended-tab page is on screen).
   */
  async prepareForUpdate(): Promise<boolean> {
    const tabs = await this.deps.browser.queryTabs()
    await this.settleAll(tabs)
    return !tabs.some((t) => t.placeholder && !t.discarded && t.active)
  }

  /** What the popup says about a tab: evaluated as if you left it right now. */
  async status(tabId: number): Promise<TabStatus> {
    const { browser, activity, isOnline } = this.deps
    const settings = await this.deps.settings.get()
    const tab = await browser.getTab(tabId)
    if (!tab) throw new UserError('That tab is already closed.')

    const snapshot = await activity.snapshot([tab])
    const paused = snapshot.isPaused(tab.id)
    const asBackground = { ...tab, active: false }
    return {
      title: tab.title || tab.url,
      suspended: isSuspended(tab),
      blocker: suspendBlocker(
        asBackground,
        { paused, online: isOnline() },
        settings,
        'auto',
      ),
      suspendAfterMinutes: settings.suspendAfterMinutes,
      site: siteOf(tab.url),
      excludedBy: excludingRule(tab.url, settings.neverSuspendSites),
      paused,
    }
  }

  /** Adds or removes the tab's site from "never suspend"; returns whether it's now excluded. */
  async toggleSite(tabId: number): Promise<boolean> {
    const tab = await this.deps.browser.getTab(tabId)
    if (!tab) throw new UserError('That tab is already closed.')
    const settings = await this.deps.settings.get()
    const rule = excludingRule(tab.url, settings.neverSuspendSites)
    if (rule) {
      await this.deps.settings.update({
        neverSuspendSites: without(settings.neverSuspendSites, rule),
      })
      return false
    }
    await this.excludeSite(tabId)
    return true
  }

  /** Adds the tab's site to "never suspend" (nothing changes if it's already covered). */
  async excludeSite(tabId: number): Promise<void> {
    const tab = await this.deps.browser.getTab(tabId)
    if (!tab) throw new UserError('That tab is already closed.')
    const settings = await this.deps.settings.get()
    if (excludingRule(tab.url, settings.neverSuspendSites)) return
    const site = siteOf(tab.url)
    if (!site) throw new UserError('Only web pages can be excluded.')
    await this.deps.settings.update({
      neverSuspendSites: [...settings.neverSuspendSites, site],
    })
  }

  private async suspendAll(
    tabs: readonly TabInfo[],
    clickToLoad: boolean,
  ): Promise<number> {
    let suspended = 0
    await runLimited(tabs, showPlaceholdersAtOnce, async (tab) => {
      if (await this.suspend(tab, clickToLoad)) suspended++
    })
    return suspended
  }

  /**
   * With click to load, a background tab is discarded as soon as its faded
   * icon is in the tab strip, so its page is only alive for a moment. The
   * tab in front keeps showing the page.
   */
  private async suspend(tab: TabInfo, clickToLoad: boolean): Promise<boolean> {
    const { browser, pages } = this.deps
    if (!clickToLoad) return browser.discard(tab.id)
    const iconShown = browser.waitForIcon(tab.id)
    if (!(await browser.navigate(tab.id, pages.placeholderFor(tab))))
      return false
    if (!tab.active && (await iconShown)) await browser.discard(tab.id)
    return true
  }

  /**
   * Going back restores the page as you left it, scroll position included,
   * because the suspended-tab page was opened on top of it. The browser
   * refuses when the tab is discarded, has no earlier page (restored from a
   * saved list), or you never clicked or typed in that page: then the
   * address is opened instead. (Clicking the suspended-tab page goes back
   * from the page itself, which works in more cases.)
   */
  private async unsuspend(tab: TabInfo): Promise<void> {
    const { browser } = this.deps
    if (tab.placeholder) {
      if (!tab.discarded && (await browser.goBack(tab.id))) return
      await browser.navigate(tab.id, tab.url)
    } else if (tab.discarded) {
      await browser.reload(tab.id)
    }
  }

  private async settleAll(tabs: readonly TabInfo[]): Promise<void> {
    for (const tab of tabs.filter(needsSettling))
      await this.deps.browser.discard(tab.id)
  }
}

function needsSettling(tab: TabInfo): boolean {
  return tab.placeholder && !tab.discarded && !tab.active
}

/**
 * The tab to show instead of the one being suspended: the most recently
 * used one that is still loaded (opening a suspended tab would reload it).
 */
export function pickNextTab(
  tabs: readonly TabInfo[],
  lastActive: (id: number) => number,
): TabInfo {
  const byRecent = tabs.toSorted((a, b) => lastActive(b.id) - lastActive(a.id))
  return byRecent.find((t) => !isSuspended(t)) ?? byRecent[0]
}

function without(list: readonly string[], item: string): string[] {
  return list.filter((x) => x !== item)
}
