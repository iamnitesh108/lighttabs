/** A tab kept in a saved list. */
export type SavedTab = {
  id: string
  url: string
  title: string
}

/** A group of tabs saved together (for example one window). */
export type SavedSession = {
  id: string
  /** Empty until the user names it; the UI then shows the date. */
  name: string
  createdAt: number
  /** A locked list stays when its tabs are restored, and can't be deleted by accident. */
  locked: boolean
  tabs: SavedTab[]
}

export type TabToSave = { url: string; title: string }

export function newSession(
  tabs: readonly TabToSave[],
  options: {
    now: number
    makeId: () => string
    skipDuplicates: boolean
    name?: string
  },
): SavedSession {
  const seen = new Set<string>()
  const saved: SavedTab[] = []
  for (const tab of tabs) {
    if (options.skipDuplicates) {
      if (seen.has(tab.url)) continue
      seen.add(tab.url)
    }
    saved.push({
      id: options.makeId(),
      url: tab.url,
      title: tab.title.trim() || tab.url,
    })
  }
  return {
    id: options.makeId(),
    name: options.name ?? '',
    createdAt: options.now,
    locked: false,
    tabs: saved,
  }
}

export function withoutTab(session: SavedSession, tabId: string): SavedSession {
  return { ...session, tabs: session.tabs.filter((t) => t.id !== tabId) }
}

/** Newest first, the way people look for "the tabs I saved earlier". */
export function sortSessions(
  sessions: readonly SavedSession[],
): SavedSession[] {
  return sessions.toSorted((a, b) => b.createdAt - a.createdAt)
}

export function countTabs(sessions: readonly SavedSession[]): number {
  return sessions.reduce((sum, s) => sum + s.tabs.length, 0)
}

/**
 * Keeps only the tabs whose title or address contains every word of the
 * query, and only the sessions that still have tabs (or whose name matches).
 */
export function searchSessions(
  sessions: readonly SavedSession[],
  query: string,
): SavedSession[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...sessions]

  const matches = (text: string) => words.every((w) => text.includes(w))
  const result: SavedSession[] = []
  for (const session of sessions) {
    if (matches(session.name.toLowerCase())) {
      result.push(session)
      continue
    }
    const tabs = session.tabs.filter((t) =>
      matches(`${t.title} ${t.url}`.toLowerCase()),
    )
    if (tabs.length > 0) result.push({ ...session, tabs })
  }
  return result
}
