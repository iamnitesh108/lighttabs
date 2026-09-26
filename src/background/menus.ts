import type { TabAction } from './tab-actions.ts'

/** A menu item, or null for a separator line. */
export type MenuEntry = { action: TabAction; title: string } | null

export type Menu = {
  /** Where the menu appears: on web pages, or on the toolbar icon. */
  context: 'page' | 'action'
  entries: MenuEntry[]
}

// The browser puts page items under a "LightTabs" submenu. The toolbar
// icon's menu allows at most six items.
export const menus: Menu[] = [
  {
    context: 'page',
    entries: [
      { action: 'suspend-tab', title: 'Suspend this tab' },
      { action: 'suspend-others', title: 'Suspend other tabs' },
      null,
      { action: 'save-tab', title: 'Save this tab' },
      { action: 'save-window', title: 'Save this window' },
      null,
      { action: 'exclude-site', title: 'Never suspend this site' },
    ],
  },
  {
    context: 'action',
    entries: [
      { action: 'suspend-others', title: 'Suspend other tabs' },
      { action: 'unsuspend-all', title: 'Unsuspend all tabs' },
      { action: 'save-window', title: 'Save this window' },
      { action: 'open-saved', title: 'Open saved tabs' },
      { action: 'open-overview', title: 'Overview of all tabs' },
    ],
  },
]

/** Menu item ids are "<context>/<action>", unique across both menus. */
export function menuItemId(menu: Menu, action: TabAction): string {
  return `${menu.context}/${action}`
}

export function actionOf(itemId: string): string {
  return itemId.slice(itemId.indexOf('/') + 1)
}
