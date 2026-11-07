/** What the extension needs to know about a browser tab. */
export type TabInfo = {
  id: number
  windowId: number
  index: number
  /**
   * The page the tab is on, or is going to. For a tab showing the
   * suspended-tab page, the page it stands for.
   */
  url: string
  title: string
  active: boolean
  pinned: boolean
  audible: boolean
  /** Unloaded by the browser; it loads the page again when opened. */
  discarded: boolean
  /** Shows the suspended-tab page, which loads the site only when clicked. */
  placeholder: boolean
  /**
   * The suspended-tab page it shows belongs to another LightTabs install
   * (an unpacked copy from another folder, or the store version). The
   * browser blocks pages of an extension that isn't installed, so the tab
   * shows an error until it gets this install's page.
   */
  foreignPlaceholder: boolean
  /**
   * Shows this install's suspended-tab page, moved over from another
   * install's. Going back would land on that blocked page, not the site.
   */
  movedPlaceholder: boolean
  /** When the suspended-tab page was shown, if the tab has one that says. */
  suspendedAt: number | null
  /** The tab group it's in, or -1 for none. */
  groupId: number
  /** False when the user or another extension has marked the tab "keep loaded". */
  autoDiscardable: boolean
}

export function isSuspended(tab: TabInfo): boolean {
  return tab.placeholder || tab.discarded
}
