import { describe, expect, it } from 'vitest'
import { defaultSettings, type Settings } from '../../src/core/settings.ts'
import {
  suspendBlocker,
  timeUntilDue,
  type SuspendMode,
} from '../../src/core/suspend-policy.ts'
import type { TabInfo } from '../../src/core/tab.ts'

const tab = (overrides: Partial<TabInfo> = {}): TabInfo => ({
  id: 1,
  windowId: 1,
  index: 0,
  url: 'https://example.com/',
  title: 'Example',
  active: false,
  pinned: false,
  audible: false,
  discarded: false,
  placeholder: false,
  suspendedAt: null,
  groupId: -1,
  autoDiscardable: true,
  ...overrides,
})
const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...defaultSettings,
  ...overrides,
})
const online = { paused: false, online: true }
const single = (t: Partial<TabInfo>) =>
  suspendBlocker(tab(t), { paused: true, online: false }, settings(), 'single')

describe('suspendBlocker', () => {
  it('allows a plain background web page in every mode', () => {
    for (const mode of ['single', 'others', 'auto'] as SuspendMode[]) {
      expect(suspendBlocker(tab(), online, settings(), mode)).toBeNull()
    }
  })

  it.each<
    [
      string,
      Partial<TabInfo>,
      Partial<Settings>,
      { paused?: boolean; online?: boolean },
      ReturnType<typeof suspendBlocker>,
    ]
  >([
    ['already suspended', { placeholder: true }, {}, {}, 'already-suspended'],
    [
      'discarded, without click to load',
      { discarded: true },
      { clickToLoad: false },
      {},
      'already-suspended',
    ],
    // With click to load, a discarded tab still gets the suspended-tab page.
    ['discarded, with click to load', { discarded: true }, {}, {}, null],
    ['browser page', { url: 'chrome://settings/' }, {}, {}, 'not-a-web-page'],
    ['the tab in front', { active: true }, {}, {}, 'active'],
    ['pinned', { pinned: true }, {}, {}, 'pinned'],
    ['playing audio', { audible: true }, {}, {}, 'playing-audio'],
    [
      'excluded site',
      { url: 'https://www.youtube.com/x' },
      { neverSuspendSites: ['youtube.com'] },
      {},
      'excluded-site',
    ],
    ['paused by the user', {}, {}, { paused: true }, 'paused'],
    ['marked keep-loaded', { autoDiscardable: false }, {}, {}, 'kept-loaded'],
    ['offline', {}, {}, { online: false }, 'offline'],
    ['timer off', {}, { suspendAfterMinutes: 0 }, {}, 'auto-suspend-off'],
  ])(
    'auto mode blocks: %s',
    (_, tabOverrides, settingOverrides, context, blocker) => {
      expect(
        suspendBlocker(
          tab(tabOverrides),
          { ...online, ...context },
          settings(settingOverrides),
          'auto',
        ),
      ).toBe(blocker)
    },
  )

  it('lets the user turn exceptions off', () => {
    const relaxed = settings({
      keepPinned: false,
      keepAudible: false,
      keepWhenOffline: false,
    })
    expect(
      suspendBlocker(
        tab({ pinned: true, audible: true }),
        { paused: false, online: false },
        relaxed,
        'auto',
      ),
    ).toBeNull()
  })

  it('"suspend others" respects exceptions but not the timer, offline or keep-loaded', () => {
    const others = (t: Partial<TabInfo>, c = online, s = settings()) =>
      suspendBlocker(tab(t), c, s, 'others')
    expect(others({ pinned: true })).toBe('pinned')
    expect(others({}, { paused: true, online: true })).toBe('paused')
    expect(others({ autoDiscardable: false })).toBeNull()
    expect(others({}, { paused: false, online: false })).toBeNull()
    expect(others({}, online, settings({ suspendAfterMinutes: 0 }))).toBeNull()
  })

  it('"suspend this tab" only refuses what is impossible', () => {
    expect(single({ active: true, pinned: true, audible: true })).toBeNull()
    expect(single({ url: 'brave://settings' })).toBe('not-a-web-page')
  })
})

describe('timeUntilDue', () => {
  it('counts down from when the tab was last used', () => {
    const s = settings({ suspendAfterMinutes: 30 })
    expect(timeUntilDue(0, 10 * 60_000, s)).toBe(20 * 60_000)
    expect(timeUntilDue(0, 30 * 60_000, s)).toBe(0)
    expect(timeUntilDue(0, 99 * 60_000, s)).toBe(0)
  })
})
