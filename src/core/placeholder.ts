import { isSuspendableUrl } from './urls.ts'

/**
 * A suspended tab shows a small page of this extension instead of the site.
 * Its address carries everything needed to bring the site back, so nothing
 * has to be stored elsewhere and the browser's own session restore keeps it:
 *
 *   chrome-extension://<id>/ui/suspended/suspended.html#title=...&url=...&since=...
 */
export const placeholderPath = 'ui/suspended/suspended.html'

export type SuspendedPage = {
  url: string
  title: string
  /** When the tab was suspended (ms since 1970); older placeholders don't say. */
  since?: number
}

/** The placeholder address for a page. `base` is the extension's placeholder page. */
export function placeholderUrl(base: string, page: SuspendedPage): string {
  const params = new URLSearchParams({ title: page.title, url: page.url })
  if (page.since !== undefined) params.set('since', String(page.since))
  return `${base}#${params}`
}

/**
 * The page a placeholder stands for, or null if the address isn't one.
 * Only web pages are accepted: the placeholder navigates to this address
 * when clicked, so it must never be a javascript: or browser URL.
 */
export function parsePlaceholder(
  url: string,
  base: string,
): SuspendedPage | null {
  if (!url.startsWith(`${base}#`)) return null
  const params = new URLSearchParams(url.slice(base.length + 1))
  const pageUrl = params.get('url') ?? ''
  if (!isSuspendableUrl(pageUrl)) return null
  const since = Number(params.get('since'))
  return {
    url: pageUrl,
    title: params.get('title') ?? '',
    ...(since > 0 && { since }),
  }
}

/**
 * The page behind a suspended-tab address of any LightTabs install, not
 * only this one. An unpacked copy gets a new id when its folder moves, and
 * the store version has another id again, so the old addresses stop
 * opening. The real address is still in there, so it's worth keeping.
 */
export function parseAnyPlaceholder(url: string): SuspendedPage | null {
  const base =
    /^chrome-extension:\/\/[a-p]{32}\/ui\/suspended\/suspended\.html(?=#)/.exec(
      url,
    )
  return base ? parsePlaceholder(url, base[0]) : null
}

/**
 * A saved tab with its real address, if it was saved as a suspended-tab
 * address. A title that was only the address becomes the page's title.
 */
export function withRealAddress<T extends { url: string; title: string }>(
  tab: T,
): T {
  const page = parseAnyPlaceholder(tab.url)
  if (!page) return tab
  const title =
    tab.title && tab.title !== tab.url ? tab.title : page.title || page.url
  return { ...tab, url: page.url, title }
}
