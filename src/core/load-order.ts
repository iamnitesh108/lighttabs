/**
 * The tabs closest to the one you're on come first: they're the ones you're
 * most likely to open next. On a tie, the tab to the right wins, since
 * people tend to read tabs left to right.
 */
export function nearestFirst<T extends { index: number }>(
  tabs: readonly T[],
  fromIndex: number,
): T[] {
  const distance = (t: T) => Math.abs(t.index - fromIndex)
  return tabs.toSorted((a, b) => distance(a) - distance(b) || b.index - a.index)
}

/**
 * How many pages to load at once. Each loading page keeps about one core
 * busy, and loading more than the machine can handle makes every page
 * slower: half the cores, between 2 and 6.
 */
export function loadLimit(cpuCores: number): number {
  return Math.min(6, Math.max(2, Math.floor(cpuCores / 2)))
}
