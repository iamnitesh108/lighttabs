import { describe, expect, it } from 'vitest'
import { Badge } from '../../src/background/badge.ts'
import type { BadgeDisplay } from '../../src/background/ports.ts'
import { badgeText } from '../../src/core/format.ts'
import { FakeBrowser, MemorySettings } from '../support/fakes.ts'

class ShownText implements BadgeDisplay {
  text = 'unset'
  tooltip = 'unset'
  async show(badge: string, tooltip: string): Promise<void> {
    this.text = badge
    this.tooltip = tooltip
  }
}

describe('Badge', () => {
  it('counts suspended tabs in every window, with the badge only when switched on', async () => {
    const browser = new FakeBrowser()
    browser.addTab({ active: true })
    browser.addTab({ discarded: true })
    browser.addTab({ placeholder: true, windowId: 2 })
    const settings = new MemorySettings()
    const display = new ShownText()
    const badge = new Badge(browser, settings, display)

    await badge.update()
    expect(display.text).toBe('') // off by default: it covers the icon
    expect(display.tooltip).toBe('LightTabs: 2 suspended tabs')

    await settings.update({ showBadge: true })
    await badge.update()
    expect(display.text).toBe('2')
  })

  it('shows nothing for zero and caps long numbers', () => {
    expect([0, 7, 999, 1000].map(badgeText)).toEqual(['', '7', '999', '999+'])
  })
})
