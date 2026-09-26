import type { BadgeDisplay } from '../background/ports.ts'

/** The toolbar badge, in the extension's own colour, and the icon's tooltip. */
export class ChromeBadge implements BadgeDisplay {
  private styled = false

  async show(badge: string, tooltip: string): Promise<void> {
    if (!this.styled) {
      await chrome.action.setBadgeBackgroundColor({ color: '#0e7c66' })
      await chrome.action.setBadgeTextColor({ color: '#ffffff' })
      this.styled = true
    }
    await chrome.action.setBadgeText({ text: badge })
    await chrome.action.setTitle({ title: tooltip })
  }
}
