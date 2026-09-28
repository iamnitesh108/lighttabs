import type { SuspendedPage } from '../core/placeholder.ts'
import { placeholderPath, placeholderUrl } from '../core/placeholder.ts'
import type { Browser } from '../platform/browser.ts'

/** Opens the extension's own pages, reusing a tab that already shows them. */
export class Pages {
  private readonly browser: Browser
  /** Every page of this extension starts with it: chrome-extension://<id>/. */
  readonly origin: string
  readonly savedPageUrl: string
  readonly overviewUrl: string
  readonly placeholderBase: string

  constructor(browser: Browser, origin: string) {
    this.browser = browser
    this.origin = origin
    this.savedPageUrl = `${origin}ui/saved/saved.html`
    this.overviewUrl = `${origin}ui/overview/overview.html`
    this.placeholderBase = origin + placeholderPath
  }

  /** The suspended-tab page standing in for a page. */
  placeholderFor(page: SuspendedPage): string {
    return placeholderUrl(this.placeholderBase, page)
  }

  /** Whether a tab shows one of this extension's own pages (never saved or closed by it). */
  isOwnPage(url: string): boolean {
    return url.startsWith(this.origin)
  }

  showSaved(windowId?: number): Promise<void> {
    return this.show(this.savedPageUrl, windowId)
  }

  /** Every window gets its own overview, each showing the tabs of all windows. */
  showOverview(windowId?: number): Promise<void> {
    return this.show(this.overviewUrl, windowId, windowId)
  }

  /**
   * Switches to a page of this extension if it's open (only looking in
   * searchWindow, when given), else opens it in windowId.
   */
  private async show(
    url: string,
    windowId?: number,
    searchWindow?: number,
  ): Promise<void> {
    const tabs = await this.browser.queryTabs(
      searchWindow === undefined ? {} : { windowId: searchWindow },
    )
    const open = tabs.find((t) => t.url.startsWith(url))
    if (open) {
      await this.browser.activate(open.id)
      await this.browser.focusWindow(open.windowId)
      return
    }
    await this.browser.createTab({ url, windowId, active: true })
  }
}
