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
  /** When the suspended-tab page was shown, if the tab has one that says. */
  suspendedAt: number | null
  /** False when the user or another extension has marked the tab "keep loaded". */
  autoDiscardable: boolean
}

export function isSuspended(tab: TabInfo): boolean {
  return tab.placeholder || tab.discarded
}
