import type { Browser } from '../platform/browser.ts'
import type { Pages } from './pages.ts'
import type { ValueStore } from './ports.ts'
import type { Target } from './tab-actions.ts'

/**
 * The overview shortcut works like a switch: used on any tab it shows the
 * overview, used on the overview it goes back to the tab it came from.
 */
export class OverviewToggle {
  private readonly browser: Browser
  private readonly pages: Pages
  /** The tab the overview was last opened from (kept while the worker sleeps). */
  private readonly cameFrom: ValueStore<Target>

  constructor(browser: Browser, pages: Pages, cameFrom: ValueStore<Target>) {
    this.browser = browser
    this.pages = pages
    this.cameFrom = cameFrom
  }

  async toggle(from: Target): Promise<void> {
    const tab = await this.browser.getTab(from.tabId)
    if (!tab?.url.startsWith(this.pages.overviewUrl)) {
      await this.cameFrom.set(from)
      await this.pages.showOverview(from.windowId)
      return
    }
    const back = await this.cameFrom.get()
    // The tab may have closed since; then the overview simply stays.
    if (!back || !(await this.browser.getTab(back.tabId))) return
    await this.browser.activate(back.tabId)
    await this.browser.focusWindow(back.windowId)
  }
}
