/**
 * The site icon for a URL, from the browser's own favicon cache (the
 * "favicon" permission). Nothing is fetched from the website itself.
 */
export function faviconUrl(pageUrl: string, size = 16): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'))
  url.searchParams.set('pageUrl', pageUrl)
  url.searchParams.set('size', String(size))
  return url.toString()
}
