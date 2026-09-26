import { describe, expect, it } from 'vitest'
import { actionOf, menuItemId, menus } from '../../src/background/menus.ts'

describe('menus', () => {
  it('fits the toolbar icon menu limit of six items', () => {
    const toolbar = menus.find((m) => m.context === 'action')!
    expect(toolbar.entries.length).toBeLessThanOrEqual(6)
  })

  it('reads the action back from a menu item id', () => {
    for (const menu of menus) {
      for (const entry of menu.entries) {
        if (entry)
          expect(actionOf(menuItemId(menu, entry.action))).toBe(entry.action)
      }
    }
  })
})
