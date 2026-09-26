import { withRealAddress } from '../core/placeholder.ts'
import type { SavedSession } from '../core/sessions.ts'
import { SerialQueue } from './serial-queue.ts'

const prefix = 'session:'

/**
 * Saved lists live in storage.local (unlimited, thanks to the
 * unlimitedStorage permission), one key per list. Changing one list only
 * rewrites that list, not everything saved.
 */
export class SessionStore {
  private readonly queue = new SerialQueue()

  async list(): Promise<SavedSession[]> {
    const all = await chrome.storage.local.get(null)
    return Object.entries(all)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => withRealAddresses(v as SavedSession))
  }

  async get(id: string): Promise<SavedSession | null> {
    const found = await chrome.storage.local.get(prefix + id)
    const session = found[prefix + id] as SavedSession | undefined
    return session ? withRealAddresses(session) : null
  }

  add(sessions: readonly SavedSession[]): Promise<void> {
    return this.queue.run(() =>
      chrome.storage.local.set(
        Object.fromEntries(sessions.map((s) => [prefix + s.id, s])),
      ),
    )
  }

  /**
   * Changes one list. change returns the new list, or null to delete it.
   * Lists left without tabs are deleted too.
   */
  update(
    id: string,
    change: (session: SavedSession) => SavedSession | null,
  ): Promise<SavedSession | null> {
    return this.queue.run(async () => {
      const current = await this.get(id)
      if (!current) return null
      const next = change(current)
      if (!next || next.tabs.length === 0) {
        await chrome.storage.local.remove(prefix + id)
        return null
      }
      await chrome.storage.local.set({ [prefix + id]: next })
      return next
    })
  }

  remove(id: string): Promise<void> {
    return this.queue.run(() => chrome.storage.local.remove(prefix + id))
  }

  /** Calls listener after any list changes (added, edited, deleted). */
  onChange(listener: () => void): void {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (
        area === 'local' &&
        Object.keys(changes).some((k) => k.startsWith(prefix))
      )
        listener()
    })
  }
}

/**
 * Lists may hold suspended-tab addresses of an older install, saved before
 * those were recognised. Reading them with the real address repairs them
 * everywhere (shown, searched, exported, restored), and the next change to
 * a list stores the repaired version.
 */
function withRealAddresses(session: SavedSession): SavedSession {
  return { ...session, tabs: session.tabs.map(withRealAddress) }
}
