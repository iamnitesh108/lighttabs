/** What a tab can be found by. */
export type Searchable = { title: string; url: string }

/** The words of a search, lowercase; an empty list matches everything. */
export function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/**
 * How well a tab matches every word of a search (higher is better), or
 * null when a word matches nothing. A word counts most at the start of the
 * title or of a word in it, then anywhere in the title, then in the site,
 * then in the rest of the address, and least as scattered letters of the
 * title ("gthb" for GitHub). The "https://www." part is never searched, so
 * "com" or "http" don't match everything.
 */
export function searchScore(
  item: Searchable,
  words: readonly string[],
): number | null {
  const title = item.title.toLowerCase()
  const { host, rest } = splitAddress(item.url.toLowerCase())
  let score = 0
  for (const word of words) {
    const points = Math.max(
      titlePoints(title, word),
      host.startsWith(word) ? 60 : host.includes(word) ? 40 : 0,
      rest.includes(word) ? 10 : 0,
      word.length > 1 && isScattered(word, title) ? 5 : 0,
    )
    if (points === 0) return null
    score += points
  }
  return score
}

function titlePoints(title: string, word: string): number {
  const at = title.indexOf(word)
  if (at === 0) return 100
  if (at < 0) return 0
  // At the start of a later word ("rust" in "The Rust book") beats the middle of one.
  const startsWord = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}`, 'u')
  return startsWord.test(title) ? 80 : 50
}

/** Whether all of the word's letters appear in the text, in order. */
function isScattered(word: string, text: string): boolean {
  let at = 0
  for (const letter of word) {
    at = text.indexOf(letter, at)
    if (at < 0) return false
    at++
  }
  return true
}

function splitAddress(url: string): { host: string; rest: string } {
  const withoutScheme = url.replace(/^[a-z-]+:\/\//, '')
  const slash = withoutScheme.indexOf('/')
  const host = (
    slash < 0 ? withoutScheme : withoutScheme.slice(0, slash)
  ).replace(/^www\./, '')
  return { host, rest: slash < 0 ? '' : withoutScheme.slice(slash) }
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Where the search words appear in a text, as [start, end) ranges without
 * overlaps, for highlighting. Only whole-word-part matches are marked.
 */
export function matchRanges(
  text: string,
  words: readonly string[],
): [number, number][] {
  const lower = text.toLowerCase()
  const ranges: [number, number][] = []
  for (const word of words) {
    const at = lower.indexOf(word)
    if (at >= 0) ranges.push([at, at + word.length])
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const range of ranges) {
    const last = merged.at(-1)
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  }
  return merged
}
