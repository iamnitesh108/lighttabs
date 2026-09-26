/**
 * The site a URL belongs to, for "never suspend this site" rules:
 * "https://www.youtube.com/watch?v=1" → "youtube.com". Null for URLs that
 * have no site (about:blank, file:, browser pages).
 */
export function siteOf(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return null
    return hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/**
 * Cleans a rule typed by a person. Accepts "youtube.com", "www.youtube.com"
 * or a pasted URL, and returns "youtube.com"; null when it isn't a site.
 */
export function normalizeSiteRule(input: string): string | null {
  const text = input.trim().toLowerCase()
  if (!text) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(text)
    ? text
    : `https://${text}`
  const site = siteOf(withScheme)
  if (
    !site ||
    !/^[a-z0-9.-]+$/.test(site) ||
    site.startsWith('.') ||
    site.endsWith('.')
  ) {
    return null
  }
  return site
}

/** A rule covers its own site and every subdomain: "google.com" matches "mail.google.com". */
export function matchesSiteRule(site: string, rule: string): boolean {
  return site === rule || site.endsWith(`.${rule}`)
}

export function isSiteExcluded(url: string, rules: readonly string[]): boolean {
  const site = siteOf(url)
  return site !== null && rules.some((rule) => matchesSiteRule(site, rule))
}

/** The rule that excludes this URL, to remove it again ("youtube.com" for a YouTube tab). */
export function excludingRule(
  url: string,
  rules: readonly string[],
): string | null {
  const site = siteOf(url)
  if (!site) return null
  return rules.find((rule) => matchesSiteRule(site, rule)) ?? null
}
