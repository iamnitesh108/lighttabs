import type { SavedSession } from '../core/sessions.ts'
import type { Settings } from '../core/settings.ts'
import type { Activity } from '../platform/activity-store.ts'

// The storage the background services need, as small interfaces. The real
// implementations are in platform/; tests pass in-memory fakes.

export interface SettingsSource {
  get(): Promise<Settings>
  update(patch: Partial<Settings>): Promise<Settings>
}

export interface SessionRepository {
  list(): Promise<SavedSession[]>
  get(id: string): Promise<SavedSession | null>
  add(sessions: readonly SavedSession[]): Promise<void>
  update(
    id: string,
    change: (session: SavedSession) => SavedSession | null,
  ): Promise<SavedSession | null>
  remove(id: string): Promise<void>
}

/** The extension's toolbar icon: a small badge text, and a tooltip. */
export interface BadgeDisplay {
  show(badge: string, tooltip: string): Promise<void>
}

export interface ActivityRepository {
  read(): Promise<Activity>
  update(change: (activity: Activity) => void): Promise<void>
}

/** One small value kept across service worker restarts. */
export interface ValueStore<T> {
  get(): Promise<T | undefined>
  set(value: T): Promise<void>
}
