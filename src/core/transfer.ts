import type { SavedSession, TabToSave } from './sessions.ts'
import { newSession } from './sessions.ts'
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
    const tabs = (Array.isArray(raw.tabs) ? raw.tabs : [])
      .filter(
        (t): t is TabToSave =>
          typeof t?.url === 'string' && isRestorableUrl(t.url),
      )
      .map((t) => ({
        url: t.url,
        title: typeof t.title === 'string' ? t.title : t.url,
      }))
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
      const cleanUrl = url.trim()
      if (isRestorableUrl(cleanUrl))
        tabs.push({ url: cleanUrl, title: rest.join(' | ').trim() || cleanUrl })
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
  tabs?: { url?: unknown; title?: unknown }[]
}

function isBackup(data: unknown): data is { sessions: RawSession[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { format?: unknown }).format === 'lighttabs' &&
    Array.isArray((data as { sessions?: unknown }).sessions)
  )
}
