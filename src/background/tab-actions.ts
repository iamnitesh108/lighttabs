import type { Pages } from './pages.ts'
import type { Suspender } from './suspender.ts'
import type { TabSaver } from './tab-saver.ts'

/** The tab a keyboard shortcut or menu item was used on. */
export type Target = { tabId: number; windowId: number }

/**
 * What a keyboard shortcut or a right-click menu item can do. The shortcut
 * names in manifest.json are the same words, so both share this table.
 */
export function tabActions(
  suspender: Suspender,
  saver: TabSaver,
  pages: Pages,
) {
  return {
    'suspend-tab': ({ tabId }: Target) => suspender.toggleTab(tabId),
    'suspend-others': ({ windowId }: Target) =>
      suspender.suspendOthers(windowId),
    'unsuspend-all': ({ windowId }: Target) => suspender.unsuspendAll(windowId),
    'save-tab': ({ tabId }: Target) => saver.saveTab(tabId),
    'save-window': ({ windowId }: Target) => saver.saveWindow(windowId),
    'exclude-site': ({ tabId }: Target) => suspender.excludeSite(tabId),
    'open-saved': ({ windowId }: Target) => pages.showSaved(windowId),
  } satisfies Record<string, (target: Target) => Promise<unknown>>
}

export type TabAction = keyof ReturnType<typeof tabActions>
