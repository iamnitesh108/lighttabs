import type { Settings } from './settings.ts'
import type { TabInfo } from './tab.ts'

const dayMs = 24 * 60 * 60 * 1000

/**
 * Suspended tabs that haven't been opened for the chosen number of days:
 * saving and closing them frees the little memory a suspended tab still
 * uses. Only tabs whose suspended-tab page records when it was shown count;
 * the tab in front and (if the user wants) pinned tabs always stay.
 */
export function unusedSuspendedTabs(
  tabs: readonly TabInfo[],
  now: number,
  settings: Settings,
): TabInfo[] {
  const days = settings.saveSuspendedAfterDays
  if (days === 0) return []
  return tabs.filter(
    (t) =>
      t.placeholder &&
      t.suspendedAt !== null &&
      now - t.suspendedAt >= days * dayMs &&
      !t.active &&
      !(t.pinned && settings.keepPinnedWhenSaving),
  )
}
