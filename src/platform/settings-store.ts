import type { Settings } from '../core/settings.ts'
import { normalizeSettings } from '../core/settings.ts'
import { SerialQueue } from './serial-queue.ts'

const key = 'settings'

/**
 * Settings live in storage.sync, so they follow the user to their other
 * computers. They're small, well under sync's size limits.
 */
export class SettingsStore {
  private readonly queue = new SerialQueue()

  async get(): Promise<Settings> {
    const stored = await chrome.storage.sync.get(key)
    return normalizeSettings(stored[key])
  }

  update(patch: Partial<Settings>): Promise<Settings> {
    return this.queue.run(async () => {
      const next = normalizeSettings({ ...(await this.get()), ...patch })
      await chrome.storage.sync.set({ [key]: next })
      return next
    })
  }

  /** Calls listener with the new settings whenever they change (in any page). */
  onChange(listener: (settings: Settings) => void): void {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && key in changes)
        listener(normalizeSettings(changes[key].newValue))
    })
  }
}
