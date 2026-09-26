import type { GroupInfo, SavedSession, TabToSave } from './sessions.ts'
import { groupColors, newSession } from './sessions.ts'
import { withRealAddress } from './placeholder.ts'
import { isRestorableUrl } from './urls.ts'

/** Our own backup format: everything, exactly. */
type Backup = {
  format: 'lighttabs'
  version: 1
  exportedAt: number
  sessions: SavedSession[]
}

export class ImportError extends Error {}

export function exportBackup(
  sessions: readonly SavedSession[],
  now: number,
): string {
  const backup: Backup = {
    format: 'lighttabs',
    version: 1,
    exportedAt: now,
    sessions: [...sessions],
  }
  return JSON.stringify(backup, null, 2)
}

/**
 * OneTab's text format: one "url | title" per line, a blank line between
 * lists. Exporting it lets people move to (or from) OneTab.
 */
export function exportText(sessions: readonly SavedSession[]): string {
  return sessions
    .map((s) => s.tabs.map((t) => `${t.url} | ${t.title}`).join('\n'))
    .join('\n\n')
    .concat('\n')
}

/**
 * Reads a LightTabs backup or a OneTab export. Tabs with addresses that
 * can't be reopened (browser pages, garbage) are skipped. Imported lists
 * get new ids, so importing twice never overwrites anything.
 */
export function parseImport(
  text: string,
  options: { now: number; makeId: () => string },
): SavedSession[] {
  const trimmed = text.trim()
  if (!trimmed) throw new ImportError('The file is empty.')
  const sessions = trimmed.startsWith('{')
    ? fromBackup(trimmed, options)
    : fromText(trimmed, options)
  if (sessions.length === 0) throw new ImportError('No tabs found to import.')
  return sessions
}

function fromBackup(
  text: string,
  options: { now: number; makeId: () => string },
): SavedSession[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new ImportError('This file is not valid JSON.')
  }
  if (!isBackup(data))
    throw new ImportError('This JSON file is not a LightTabs backup.')

  const sessions: SavedSession[] = []
  for (const raw of data.sessions) {
    const groups = readGroups(raw.groups)
    const tabs: TabToSave[] = (Array.isArray(raw.tabs) ? raw.tabs : [])
      .map(realAddressOf)
      .filter(
        (t): t is { url: string; title?: unknown; group?: unknown } =>
          typeof t?.url === 'string' && isRestorableUrl(t.url),
      )
      .map((t) => {
        const group =
          typeof t.group === 'string' ? groups.get(t.group) : undefined
        return {
          url: t.url,
          title: typeof t.title === 'string' ? t.title : t.url,
          ...(group && { group: { ...group, key: t.group as string } }),
        }
      })
    if (tabs.length === 0) continue
    const session = newSession(tabs, {
      now: typeof raw.createdAt === 'number' ? raw.createdAt : options.now,
      makeId: options.makeId,
      skipDuplicates: false,
      name: typeof raw.name === 'string' ? raw.name : '',
    })
    sessions.push({ ...session, locked: raw.locked === true })
  }
  return sessions
}

function fromText(
  text: string,
  options: { now: number; makeId: () => string },
): SavedSession[] {
  const groups = text.split(/\n\s*\n/)
  const sessions: SavedSession[] = []
  // Keep the file's order when sorted newest first: earlier groups get later times.
  groups.forEach((group, i) => {
    const tabs: TabToSave[] = []
    for (const line of group.split('\n')) {
      const [url = '', ...rest] = line.split(' | ')
      const tab = withRealAddress({
        url: url.trim(),
        title: rest.join(' | ').trim(),
      })
      if (isRestorableUrl(tab.url))
        tabs.push({ ...tab, title: tab.title || tab.url })
    }
    if (tabs.length > 0) {
      sessions.push(
        newSession(tabs, {
          now: options.now - i,
          makeId: options.makeId,
          skipDuplicates: false,
        }),
      )
    }
  })
  return sessions
}

type RawSession = {
  name?: unknown
  createdAt?: unknown
  locked?: unknown
  tabs?: { url?: unknown; title?: unknown; group?: unknown }[]
  groups?: unknown
}

/** A backup's saved groups by id; anything malformed is left out. */
function readGroups(raw: unknown): Map<string, GroupInfo> {
  const groups = new Map<string, GroupInfo>()
  if (!Array.isArray(raw)) return groups
  for (const g of raw as Record<string, unknown>[]) {
    if (typeof g?.id !== 'string') continue
    const color = groupColors.find((c) => c === g.color) ?? 'grey'
    groups.set(g.id, {
      title: typeof g.title === 'string' ? g.title : '',
      color,
      collapsed: g.collapsed === true,
    })
  }
  return groups
}

function isBackup(data: unknown): data is { sessions: RawSession[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { format?: unknown }).format === 'lighttabs' &&
    Array.isArray((data as { sessions?: unknown }).sessions)
  )
}

/** A backup tab with its real address, if it was saved as a suspended tab. */
function realAddressOf<T extends { url?: unknown; title?: unknown }>(
  tab: T,
): T {
  if (typeof tab?.url !== 'string') return tab
  const title = typeof tab.title === 'string' ? tab.title : ''
  const real = withRealAddress({ url: tab.url, title })
  return real.url === tab.url ? tab : { ...tab, ...real }
}
