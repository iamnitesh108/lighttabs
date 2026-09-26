import { SerialQueue } from './serial-queue.ts'

type Activity = {
  /** When each tab was last in front (ms). */
  lastActive: Record<string, number>
  /** Which tab is in front in each window, to know which one was just left. */
  frontTab: Record<string, number>
  /** Tabs the user paused auto-suspend for, until they close. */
  paused: number[]
}

const key = 'activity'

/**
 * Tab activity lives in storage.session: kept while the browser runs (the
 * service worker itself is stopped after about 30 s idle and loses its
 * memory), gone when the browser closes, which is right: tab ids don't
 * survive a restart either.
 */
export class ActivityStore {
  private readonly queue = new SerialQueue()

  async read(): Promise<Activity> {
    const stored = await chrome.storage.session.get(key)
    const value = stored[key] as Partial<Activity> | undefined
    return {
      lastActive: value?.lastActive ?? {},
      frontTab: value?.frontTab ?? {},
      paused: value?.paused ?? [],
    }
  }

  update(change: (activity: Activity) => void): Promise<void> {
    return this.queue.run(async () => {
      const activity = await this.read()
      change(activity)
      await chrome.storage.session.set({ [key]: activity })
    })
  }
}

export type { Activity }
