/** The browser's tab group colours. */
export const groupColors = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const
export type GroupColor = (typeof groupColors)[number]

/** A tab group as the user sees it. */
export type GroupInfo = { title: string; color: GroupColor; collapsed: boolean }

export type SavedGroup = GroupInfo & { id: string }

/** A tab kept in a saved list. */
export type SavedTab = {
  id: string
  url: string
  title: string
  /** The saved group it was in, if any. */
  group?: string
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
  /** Tab groups in the list (missing in lists saved by older versions). */
  groups?: SavedGroup[]
}

/**
 * A tab about to be saved. Tabs with the same group key were in the same
 * group (the key is the browser's group id, or a saved group's id).
 */
export type TabToSave = {
  url: string
  title: string
  group?: GroupInfo & { key: number | string }
}

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
  const groups = new Map<number | string, SavedGroup>()
  for (const tab of tabs) {
    if (options.skipDuplicates) {
      if (seen.has(tab.url)) continue
      seen.add(tab.url)
    }
    let group: SavedGroup | undefined
    if (tab.group) {
      const { key, title, color, collapsed } = tab.group
      group = groups.get(key)
      if (!group) {
        group = { id: options.makeId(), title, color, collapsed }
        groups.set(key, group)
      }
    }
    saved.push({
      id: options.makeId(),
      url: tab.url,
      title: tab.title.trim() || tab.url,
      ...(group && { group: group.id }),
    })
  }
  return {
    id: options.makeId(),
    name: options.name ?? '',
    createdAt: options.now,
    locked: false,
    tabs: saved,
    ...(groups.size > 0 && { groups: [...groups.values()] }),
  }
}

/** The list without one tab; a group left with no tabs goes too. */
export function withoutTab(session: SavedSession, tabId: string): SavedSession {
  const tabs = session.tabs.filter((t) => t.id !== tabId)
  if (!session.groups) return { ...session, tabs }
  const used = new Set(tabs.map((t) => t.group))
  return {
    ...session,
    tabs,
    groups: session.groups.filter((g) => used.has(g.id)),
  }
}

/** The tabs of a list, with the saved group each one belongs to. */
export function tabsWithGroups(
  session: SavedSession,
): { tab: SavedTab; group: SavedGroup | undefined }[] {
  const byId = new Map(session.groups?.map((g) => [g.id, g]))
  return session.tabs.map((tab) => ({
    tab,
    group: tab.group === undefined ? undefined : byId.get(tab.group),
  }))
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
