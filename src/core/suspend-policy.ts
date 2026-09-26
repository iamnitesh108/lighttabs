import type { Settings } from './settings.ts'
import { isSiteExcluded } from './sites.ts'
import type { TabInfo } from './tab.ts'
import { isSuspendableUrl } from './urls.ts'

/** Why a tab isn't suspended. Each one is shown to the user in plain words. */
export type Blocker =
  | 'already-suspended'
  | 'not-a-web-page'
  | 'active'
  | 'pinned'
  | 'playing-audio'
  | 'excluded-site'
  | 'paused'
  | 'kept-loaded'
  | 'offline'
  | 'auto-suspend-off'

/**
 * - single: the user asked to suspend this one tab: only impossible cases block it.
 * - others: "suspend other tabs": the user's exceptions apply, the timer doesn't.
 * - auto: the timer: every exception applies.
 */
export type SuspendMode = 'single' | 'others' | 'auto'

export type SuspendContext = {
  paused: boolean
  online: boolean
}

/** Returns why the tab can't be suspended, or null when it can. */
export function suspendBlocker(
  tab: TabInfo,
  context: SuspendContext,
  settings: Settings,
  mode: SuspendMode,
): Blocker | null {
  if (tab.placeholder) return 'already-suspended'
  // A tab the browser discarded by itself reloads as soon as it's opened;
  // with click-to-load it still gets the suspended-tab page.
  if (tab.discarded && !settings.clickToLoad) return 'already-suspended'
  if (!isSuspendableUrl(tab.url)) return 'not-a-web-page'
  if (mode === 'single') return null

  if (tab.active) return 'active'
  if (settings.keepPinned && tab.pinned) return 'pinned'
  if (settings.keepAudible && tab.audible) return 'playing-audio'
  if (isSiteExcluded(tab.url, settings.neverSuspendSites))
    return 'excluded-site'
  if (context.paused) return 'paused'
  if (mode === 'others') return null

  if (!tab.autoDiscardable) return 'kept-loaded'
  if (settings.keepWhenOffline && !context.online) return 'offline'
  if (settings.suspendAfterMinutes === 0) return 'auto-suspend-off'
  return null
}

/** Milliseconds until the timer may suspend a tab last used at lastActive (0 = now). */
export function timeUntilDue(
  lastActive: number,
  now: number,
  settings: Settings,
): number {
  const due = lastActive + settings.suspendAfterMinutes * 60_000
  return Math.max(0, due - now)
}
