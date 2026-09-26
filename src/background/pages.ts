import type { SuspendedPage } from '../core/placeholder.ts'
import { placeholderPath, placeholderUrl } from '../core/placeholder.ts'
import type { Browser } from '../platform/browser.ts'

/** Opens the extension's own pages, reusing a tab that already shows them. */
export class Pages {
  private readonly browser: Browser
  /** Every page of this extension starts with it: chrome-extension://<id>/. */
  readonly origin: string
  readonly savedPageUrl: string
  readonly placeholderBase: string

  constructor(browser: Browser, origin: string) {
    this.browser = browser
    this.origin = origin
    this.savedPageUrl = `${origin}ui/saved/saved.html`
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

  /** Shows the saved tabs page: switches to it if it's open, else opens it in windowId. */
  async showSaved(windowId?: number): Promise<void> {
    const open = (await this.browser.queryTabs()).find((t) =>
      t.url.startsWith(this.savedPageUrl),
    )
    if (open) {
      await this.browser.activate(open.id)
      await this.browser.focusWindow(open.windowId)
      return
    }
    await this.browser.createTab({
      url: this.savedPageUrl,
      windowId,
      active: true,
    })
  }
}
