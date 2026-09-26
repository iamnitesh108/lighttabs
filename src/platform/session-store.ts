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
      .map(([, v]) => v as SavedSession)
  }

  async get(id: string): Promise<SavedSession | null> {
    const found = await chrome.storage.local.get(prefix + id)
    return (found[prefix + id] as SavedSession | undefined) ?? null
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
