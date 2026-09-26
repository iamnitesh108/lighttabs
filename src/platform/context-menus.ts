import type { Menu } from '../background/menus.ts'
import { menuItemId } from '../background/menus.ts'

/** Page menus appear on web pages only, not on browser or extension pages. */
const webPages = ['http://*/*', 'https://*/*', 'file:///*']

/**
 * Creates the right-click menus. The browser keeps them, so this runs once
 * after install or update (removing old items first, in case they changed).
 */
export async function createMenus(menus: readonly Menu[]): Promise<void> {
  await chrome.contextMenus.removeAll()
  for (const menu of menus) {
    let separators = 0
    for (const entry of menu.entries) {
      chrome.contextMenus.create({
        id: entry
          ? menuItemId(menu, entry.action)
          : `${menu.context}/separator-${++separators}`,
        type: entry ? 'normal' : 'separator',
        title: entry?.title,
        contexts: [menu.context],
        documentUrlPatterns: menu.context === 'page' ? webPages : undefined,
      })
    }
  }
}
