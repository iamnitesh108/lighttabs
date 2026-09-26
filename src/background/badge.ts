import { badgeText, plural } from '../core/format.ts'
import { isSuspended } from '../core/tab.ts'
import type { Browser } from '../platform/browser.ts'
import type { BadgeDisplay, SettingsSource } from './ports.ts'

/** How long to wait for more tab changes before counting again. */
const settleMs = 300

/**
 * Shows how many tabs are suspended in the toolbar icon's tooltip, and as
 * a badge if the user wants one. Suspending a window changes dozens of
 * tabs in a moment, so changes are gathered and counted once they stop.
 */
export class Badge {
  private readonly browser: Browser
  private readonly settings: SettingsSource
  private readonly display: BadgeDisplay
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    browser: Browser,
    settings: SettingsSource,
    display: BadgeDisplay,
  ) {
    this.browser = browser
    this.settings = settings
    this.display = display
  }

  /** Something changed: count again soon. */
  scheduleUpdate(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.update(), settleMs)
  }

  async update(): Promise<void> {
    const settings = await this.settings.get()
    const count = (await this.browser.queryTabs()).filter(isSuspended).length
    await this.display.show(
      settings.showBadge ? badgeText(count) : '',
      `LightTabs: ${plural(count, 'suspended tab')}`,
    )
  }
}
