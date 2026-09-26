import { formatMinutes } from '../../core/format.ts'
import type { Blocker } from '../../core/suspend-policy.ts'
import type { TabStatus } from '../../shared/messages.ts'

const blockerText: Record<Blocker, string> = {
  'already-suspended': 'Suspended. Click the page to load it.',
  'not-a-web-page': 'Browser pages are never suspended.',
  active: 'This tab is open.',
  pinned: "Pinned tabs aren't suspended.",
  'playing-audio': "It's playing audio, so it stays loaded.",
  'excluded-site': 'This site is on your never-suspend list.',
  paused: 'Suspending is paused for this tab.',
  'kept-loaded': 'The browser was asked to keep this tab loaded.',
  offline: "You're offline, so tabs stay loaded.",
  'auto-suspend-off': 'Automatic suspending is off.',
}

/** One line about what will happen to the current tab, for the popup. */
export function describeStatus(status: TabStatus): string {
  if (status.suspended) return blockerText['already-suspended']
  if (status.blocker) return blockerText[status.blocker]
  return `Suspends ${formatMinutes(status.suspendAfterMinutes)} after you leave it.`
}
