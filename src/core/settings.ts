import { normalizeSiteRule } from './sites.ts'

export type Settings = {
  /** Suspend a tab after it has been in the background this long. 0 = never. */
  suspendAfterMinutes: number
  /** Tabs that auto-suspend (and "suspend other tabs") leave alone. */
  keepPinned: boolean
  keepAudible: boolean
  /** A suspended tab reloads when opened; offline it would show an error. */
  keepWhenOffline: boolean
  neverSuspendSites: string[]
  /**
   * Suspended tabs show a page with a faded icon and load only when clicked.
   * Off: the browser's own discarding, which reloads a tab as soon as it's opened.
   */
  clickToLoad: boolean
  /**
   * The number of suspended tabs as a badge on the toolbar icon. Off by
   * default: the badge covers part of the icon, and the number is in the
   * icon's tooltip anyway.
   */
  showBadge: boolean

  keepPinnedWhenSaving: boolean
  openSavedPageAfterSaving: boolean
  keepListsAfterRestoring: boolean
  /** Restored tabs appear in the tab strip but only load when opened. */
  restoreWithoutLoading: boolean
  skipDuplicatesWhenSaving: boolean
}

export const suspendAfterChoices = [
  0, 5, 15, 30, 60, 120, 360, 720, 1440,
] as const

export const defaultSettings: Settings = {
  suspendAfterMinutes: 30,
  keepPinned: true,
  keepAudible: true,
  keepWhenOffline: true,
  neverSuspendSites: [],
  clickToLoad: true,
  showBadge: false,
  keepPinnedWhenSaving: true,
  openSavedPageAfterSaving: true,
  keepListsAfterRestoring: false,
  restoreWithoutLoading: true,
  skipDuplicatesWhenSaving: true,
}

/**
 * Turns whatever is in storage (possibly from an older version, or edited by
 * hand) into valid settings: known fields with the right types are kept,
 * everything else falls back to the default.
 */
export function normalizeSettings(raw: unknown): Settings {
  const input = isRecord(raw) ? raw : {}
  const result: Settings = { ...defaultSettings }

  const minutes = input.suspendAfterMinutes
  if (
    typeof minutes === 'number' &&
    (suspendAfterChoices as readonly number[]).includes(minutes)
  ) {
    result.suspendAfterMinutes = minutes
  }

  for (const key of booleanKeys) {
    const value = input[key]
    if (typeof value === 'boolean') result[key] = value
  }

  if (Array.isArray(input.neverSuspendSites)) {
    const sites = input.neverSuspendSites
      .map((s) => (typeof s === 'string' ? normalizeSiteRule(s) : null))
      .filter((s): s is string => s !== null)
    result.neverSuspendSites = [...new Set(sites)].toSorted()
  }
  return result
}

type BooleanKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never
}[keyof Settings]

const booleanKeys: BooleanKey[] = [
  'keepPinned',
  'keepAudible',
  'keepWhenOffline',
  'clickToLoad',
  'showBadge',
  'keepPinnedWhenSaving',
  'openSavedPageAfterSaving',
  'keepListsAfterRestoring',
  'restoreWithoutLoading',
  'skipDuplicatesWhenSaving',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
