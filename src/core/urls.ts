/**
 * Pages worth suspending: real web pages. Browser pages (settings, new tab)
 * are cheap and often can't be discarded.
 */
export function isSuspendableUrl(url: string | undefined): boolean {
  return !!url && /^(https?|file):/.test(url)
}

/** Blank pages and new-tab pages aren't worth keeping in a saved list. */
export function isSaveableUrl(
  url: string | undefined,
  ownPagePrefix: string,
): boolean {
  if (!url || url.startsWith(ownPagePrefix)) return false
  if (url === 'about:blank') return false
  return !/^(chrome|brave|edge|vivaldi|opera):\/\/(newtab|new-tab-page|startpage)\/?$/.test(
    url,
  )
}

/** URLs a saved list may reopen. Anything else in an import is skipped. */
export function isRestorableUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return ['http:', 'https:', 'file:', 'ftp:'].includes(protocol)
  } catch {
    return false
  }
}
