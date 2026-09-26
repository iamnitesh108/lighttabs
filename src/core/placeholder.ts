import { isSuspendableUrl } from './urls.ts'

/**
 * A suspended tab shows a small page of this extension instead of the site.
 * Its address carries everything needed to bring the site back, so nothing
 * has to be stored elsewhere and the browser's own session restore keeps it:
 *
 *   chrome-extension://<id>/ui/suspended/suspended.html#title=...&url=...
 */
export const placeholderPath = 'ui/suspended/suspended.html'

export type SuspendedPage = { url: string; title: string }

/** The placeholder address for a page. `base` is the extension's placeholder page. */
export function placeholderUrl(base: string, page: SuspendedPage): string {
  const params = new URLSearchParams({ title: page.title, url: page.url })
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
  return { url: pageUrl, title: params.get('title') ?? '' }
}
