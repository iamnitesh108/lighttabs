import { SerialQueue } from './serial-queue.ts'

/**
 * One value in storage.session, under its own key. Like tab activity, it
 * lives while the browser runs and is gone after a restart, when the tab
 * ids it may hold are no longer valid anyway.
 */
export class SessionValue<T> {
  private readonly key: string
  private readonly queue = new SerialQueue()

  constructor(key: string) {
    this.key = key
  }

  async get(): Promise<T | undefined> {
    const stored = await chrome.storage.session.get(this.key)
    return stored[this.key] as T | undefined
  }

  set(value: T): Promise<void> {
    return chrome.storage.session.set({ [this.key]: value })
  }

  update(change: (value: T | undefined) => T): Promise<void> {
    return this.queue.run(async () => this.set(change(await this.get())))
  }
}
