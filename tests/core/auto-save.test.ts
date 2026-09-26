import { describe, expect, it } from 'vitest'
import { unusedSuspendedTabs } from '../../src/core/auto-save.ts'
import { defaultSettings } from '../../src/core/settings.ts'
import type { TabInfo } from '../../src/core/tab.ts'

const day = 24 * 60 * 60 * 1000
const now = 100 * day

const tab = (overrides: Partial<TabInfo>): TabInfo => ({
  id: 1,
  windowId: 1,
  index: 0,
  url: 'https://example.com/',
  title: 'Example',
  active: false,
  pinned: false,
  audible: false,
  discarded: true,
  placeholder: true,
  suspendedAt: now - 8 * day,
  autoDiscardable: true,
  ...overrides,
})

describe('unusedSuspendedTabs', () => {
  const settings = { ...defaultSettings, saveSuspendedAfterDays: 7 }

  it('picks suspended tabs older than the chosen days', () => {
    const old = tab({ id: 1 })
    const recent = tab({ id: 2, suspendedAt: now - 6 * day })
    expect(unusedSuspendedTabs([old, recent], now, settings)).toEqual([old])
  })

  it('keeps tabs it knows nothing about, the tab in front and pinned tabs', () => {
    const tabs = [
      tab({ suspendedAt: null }), // an older placeholder, or none at all
      tab({ placeholder: false, suspendedAt: null }),
      tab({ active: true }),
      tab({ pinned: true }),
    ]
    expect(unusedSuspendedTabs(tabs, now, settings)).toEqual([])
  })

  it('does nothing when switched off', () => {
    const off = { ...defaultSettings, saveSuspendedAfterDays: 0 }
    expect(unusedSuspendedTabs([tab({})], now, off)).toEqual([])
  })
})
