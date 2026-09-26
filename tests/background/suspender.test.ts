import { describe, expect, it } from 'vitest'
import { ActivityTracker } from '../../src/background/activity-tracker.ts'
import { Pages } from '../../src/background/pages.ts'
import { Suspender } from '../../src/background/suspender.ts'
import type { Settings } from '../../src/core/settings.ts'
import {
  Clock,
  FakeBrowser,
  MemoryActivity,
  MemorySettings,
  testOrigin,
} from '../support/fakes.ts'

/** Most tests use the browser's own discarding; click to load has its own section. */
function setup(settings: Partial<Settings> = {}, online = true) {
  const clock = new Clock()
  const browser = new FakeBrowser()
  const activity = new ActivityTracker(new MemoryActivity(), clock.now)
  const store = new MemorySettings({
    suspendAfterMinutes: 30,
    clickToLoad: false,
    ...settings,
  })
  const suspender = new Suspender({
    browser,
    activity,
    settings: store,
    pages: new Pages(browser, testOrigin),
    now: clock.now,
    isOnline: () => online,
    cpuCores: 4,
  })
  return { clock, browser, activity, store, suspender }
}

describe('the timer', () => {
  it('suspends only tabs that have been in the background long enough', async () => {
    const { clock, browser, activity, suspender } = setup()
    const front = browser.addTab({ active: true })
    const old = browser.addTab()
    await activity.snapshot(browser.tabs) // both seen now
    clock.advanceMinutes(20)
    const recent = browser.addTab()
    await activity.snapshot(browser.tabs)
    clock.advanceMinutes(10) // old: 30 min, recent: 10 min

    expect(await suspender.runTimer()).toBe(1)
    expect(browser.byUrl(old.url).discarded).toBe(true)
    expect(browser.byUrl(recent.url).discarded).toBe(false)
    expect(browser.byUrl(front.url).discarded).toBe(false)
  })

  it('never suspends a tab the first time it sees it', async () => {
    const { clock, browser, suspender } = setup()
    browser.addTab()
    clock.advanceMinutes(600)
    expect(await suspender.runTimer()).toBe(0)
  })

  it('respects the exceptions and pauses', async () => {
    const { clock, browser, activity, suspender } = setup({
      neverSuspendSites: ['keep.com'],
    })
    browser.addTab({ pinned: true })
    browser.addTab({ audible: true })
    browser.addTab({ url: 'https://app.keep.com/' })
    browser.addTab({ url: 'brave://settings/' })
    const paused = browser.addTab()
    await activity.togglePause(paused.id)
    await activity.snapshot(browser.tabs)
    clock.advanceMinutes(60)
    expect(await suspender.runTimer()).toBe(0)
  })

  it('does nothing when switched off or offline', async () => {
    for (const [settings, online] of [
      [{ suspendAfterMinutes: 0 }, true],
      [{}, false],
    ] as const) {
      const { clock, browser, activity, suspender } = setup(settings, online)
      browser.addTab()
      await activity.snapshot(browser.tabs)
      clock.advanceMinutes(60)
      expect(await suspender.runTimer()).toBe(0)
    }
  })
})

describe('suspending by hand', () => {
  it('switches to the most recently used loaded tab, then suspends the current one', async () => {
    const { clock, browser, activity, suspender } = setup()
    const older = browser.addTab()
    const recentButSuspended = browser.addTab({ discarded: true })
    const recent = browser.addTab()
    const current = browser.addTab({ active: true })
    await activity.tabActivated(older.id, 1)
    clock.advanceMinutes(1)
    await activity.tabActivated(recent.id, 1)
    clock.advanceMinutes(1)
    await activity.tabActivated(recentButSuspended.id, 1)
    clock.advanceMinutes(1)
    await activity.tabActivated(current.id, 1)

    await suspender.suspendTab(current.id)
    expect(browser.tabs.find((t) => t.active)!.id).toBe(recent.id)
    expect(browser.byUrl(current.url).discarded).toBe(true)
  })

  it("explains what it can't do", async () => {
    const { browser, suspender } = setup()
    const only = browser.addTab({ active: true })
    await expect(suspender.suspendTab(only.id)).rejects.toThrow('only tab')
    const page = browser.addTab({ url: 'chrome://settings/' })
    await expect(suspender.suspendTab(page.id)).rejects.toThrow(
      "Browser pages can't be suspended",
    )
    await expect(suspender.suspendTab(12345)).rejects.toThrow('already closed')
  })

  it('suspends other tabs of a window, keeping exceptions and other windows', async () => {
    const { browser, suspender } = setup()
    browser.addTab({ active: true })
    const a = browser.addTab()
    const b = browser.addTab()
    browser.addTab({ pinned: true })
    browser.addTab({ windowId: 2 })
    expect(await suspender.suspendOthers(1)).toBe(2)
    // Discarding gives tabs new ids, so they're compared by address.
    expect(browser.tabs.filter((t) => t.discarded).map((t) => t.url)).toEqual([
      a.url,
      b.url,
    ])
  })
})

describe('status and site exclusion', () => {
  it('describes the current tab as if you left it now', async () => {
    const { browser, suspender } = setup()
    const tab = browser.addTab({
      active: true,
      url: 'https://www.youtube.com/watch',
    })
    expect(await suspender.status(tab.id)).toMatchObject({
      blocker: null,
      suspendAfterMinutes: 30,
      site: 'youtube.com',
      excludedBy: null,
      paused: false,
    })
  })

  it('adds and removes the site rule', async () => {
    const { browser, store, suspender } = setup({
      neverSuspendSites: ['google.com'],
    })
    const music = browser.addTab({ url: 'https://music.youtube.com/' })
    const mail = browser.addTab({ url: 'https://mail.google.com/' })
    expect(await suspender.toggleSite(music.id)).toBe(true)
    expect(store.value.neverSuspendSites).toEqual([
      'google.com',
      'music.youtube.com',
    ])
    // A subdomain covered by a broader rule removes that rule.
    expect(await suspender.toggleSite(mail.id)).toBe(false)
    expect(store.value.neverSuspendSites).toEqual(['music.youtube.com'])
  })
})

describe('never suspend this site, from the menu', () => {
  it('adds the site once, and leaves a broader rule alone', async () => {
    const { browser, store, suspender } = setup({
      neverSuspendSites: ['google.com'],
    })
    const mail = browser.addTab({ url: 'https://mail.google.com/' })
    const news = browser.addTab({ url: 'https://www.news.com/a' })
    await suspender.excludeSite(mail.id)
    await suspender.excludeSite(news.id)
    await suspender.excludeSite(news.id)
    expect(store.value.neverSuspendSites).toEqual(['google.com', 'news.com'])
  })
})

describe('click to load', () => {
  const clickToLoad = { clickToLoad: true }

  it('shows the suspended-tab page in the tab you are looking at', async () => {
    const { browser, suspender } = setup(clickToLoad)
    browser.addTab()
    const current = browser.addTab({ active: true })
    await suspender.suspendTab(current.id)

    const tab = browser.byUrl(current.url)
    expect(tab).toMatchObject({ active: true, placeholder: true })
    expect(tab.title).toBe(current.title)
    const status = await suspender.status(tab.id)
    expect(status.suspended).toBe(true)
  })

  it('discards the suspended-tab page of a background tab once its icon shows', async () => {
    const { browser, suspender } = setup(clickToLoad)
    browser.addTab({ active: true })
    const other = browser.addTab()
    expect(await suspender.suspendOthers(1)).toBe(1)
    expect(browser.byUrl(other.url)).toMatchObject({
      placeholder: true,
      discarded: true,
    })
  })

  it('discards a suspended-tab page you switch away from, not the one in front', async () => {
    const { browser, activity, suspender } = setup(clickToLoad)
    const first = browser.addTab({ active: true })
    await activity.tabActivated(first.id, 1)
    await suspender.suspendTab(first.id)
    const second = browser.addTab()
    await browser.activate(second.id)
    const left = await activity.tabActivated(second.id, 1)
    await suspender.settle(left ?? -1)
    expect(browser.byUrl(first.url)).toMatchObject({
      placeholder: true,
      discarded: true,
    })
  })

  it('keeps the suspended-tab page loaded while it is in front', async () => {
    const { browser, suspender } = setup(clickToLoad)
    const current = browser.addTab({ active: true })
    await suspender.suspendTab(current.id)
    await suspender.settle(current.id)
    expect(browser.byUrl(current.url).discarded).toBe(false)
  })

  it('goes back to the page when it can, and opens the address otherwise', async () => {
    const { browser, suspender } = setup(clickToLoad)
    const current = browser.addTab({ active: true })
    await suspender.suspendTab(current.id)
    await suspender.unsuspendTab(current.id)
    expect(browser.byUrl(current.url)).toMatchObject({
      placeholder: false,
      title: current.title, // restored from history, not a fresh load
    })

    const other = browser.addTab()
    await suspender.suspendOthers(1)
    await suspender.settle(browser.byUrl(other.url).id)
    // A discarded tab can't go back: the address is opened instead.
    await suspender.unsuspendTab(browser.byUrl(other.url).id)
    expect(browser.byUrl(other.url)).toMatchObject({
      placeholder: false,
      discarded: false,
    })
  })

  it('gives tabs the browser discarded by itself the suspended-tab page too', async () => {
    const { clock, browser, activity, suspender } = setup(clickToLoad)
    const discarded = browser.addTab({ discarded: true })
    await activity.snapshot(browser.tabs)
    clock.advanceMinutes(30)
    expect(await suspender.runTimer()).toBe(1)
    expect(browser.byUrl(discarded.url).placeholder).toBe(true)
  })

  it('loads every suspended tab of the window', async () => {
    const { browser, suspender } = setup(clickToLoad)
    browser.addTab({ active: true })
    const a = browser.addTab()
    const b = browser.addTab({ discarded: true })
    await suspender.suspendOthers(1)
    const { count, done } = await suspender.unsuspendAll(1)
    await done
    expect(count).toBe(2)
    expect(browser.tabs.filter((t) => t.placeholder || t.discarded)).toEqual([])
    expect(browser.byUrl(a.url).placeholder).toBe(false)
    expect(browser.byUrl(b.url).placeholder).toBe(false)
  })

  it('lets an update wait while a suspended-tab page is on screen', async () => {
    const { browser, suspender } = setup(clickToLoad)
    const current = browser.addTab({ active: true })
    const other = browser.addTab()
    await suspender.suspendOthers(1)
    expect(await suspender.prepareForUpdate()).toBe(true)
    expect(browser.byUrl(other.url).discarded).toBe(true)

    await suspender.suspendTab(current.id)
    expect(await suspender.prepareForUpdate()).toBe(false)
  })
})
