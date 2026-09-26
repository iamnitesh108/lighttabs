import { describe, expect, it } from 'vitest'
import { ActivityTracker } from '../../src/background/activity-tracker.ts'
import { Pages } from '../../src/background/pages.ts'
import type { TabJob } from '../../src/background/suspender.ts'
import { Suspender } from '../../src/background/suspender.ts'
import { VideoTimes } from '../../src/background/video-times.ts'
import type { Settings } from '../../src/core/settings.ts'
import {
  Clock,
  FakeBrowser,
  MemoryActivity,
  MemorySettings,
  testOrigin,
} from '../support/fakes.ts'

/** Waits for a job over many tabs to finish; returns how many tabs it covered. */
async function finished(job: Promise<TabJob>): Promise<number> {
  const { count, done } = await job
  await done
  return count
}

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
    videos: new VideoTimes(browser, store),
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
    expect(await finished(suspender.suspendOthers(1))).toBe(2)
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
    expect(await finished(suspender.suspendOthers(1))).toBe(1)
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
    await finished(suspender.suspendOthers(1))
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
    await finished(suspender.suspendOthers(1))
    const { count, done } = await suspender.unsuspendAll(1)
    await done
    expect(count).toBe(2)
    expect(browser.tabs.filter((t) => t.placeholder || t.discarded)).toEqual([])
    expect(browser.byUrl(a.url).placeholder).toBe(false)
    expect(browser.byUrl(b.url).placeholder).toBe(false)
  })

  it('loads a waiting tab right away when you open it, and only once', async () => {
    const { browser, suspender } = setup(clickToLoad)
    browser.addTab({ active: true })
    const tabs = [browser.addTab(), browser.addTab(), browser.addTab()]
    await finished(suspender.suspendOthers(1))
    const last = browser.byUrl(tabs[2].url)

    const loads: number[] = []
    const navigate = browser.navigate.bind(browser)
    browser.navigate = (id, url) => (loads.push(id), navigate(id, url))

    const { done } = await suspender.unsuspendAll(1)
    await suspender.tabOpened(last.id) // opened before its turn came
    await done
    expect(loads.filter((id) => id === last.id)).toHaveLength(1)
    expect(browser.tabs.filter((t) => t.placeholder)).toEqual([])
  })

  it('lets an update wait while a suspended-tab page is on screen', async () => {
    const { browser, suspender } = setup(clickToLoad)
    const current = browser.addTab({ active: true })
    const other = browser.addTab()
    await finished(suspender.suspendOthers(1))
    expect(await suspender.prepareForUpdate()).toBe(true)
    expect(browser.byUrl(other.url).discarded).toBe(true)

    await suspender.suspendTab(current.id)
    expect(await suspender.prepareForUpdate()).toBe(false)
  })
})

describe('tab groups', () => {
  it('suspends only the other tabs of the group', async () => {
    const { browser, suspender } = setup()
    const current = browser.addTab({ active: true, groupId: 5 })
    const inGroup = browser.addTab({ groupId: 5 })
    const outside = browser.addTab()
    expect(await finished(suspender.suspendGroup(5))).toBe(1)
    expect(browser.byUrl(inGroup.url).discarded).toBe(true)
    expect(browser.byUrl(outside.url).discarded).toBe(false)
    expect(browser.byUrl(current.url).discarded).toBe(false)
  })
})

describe('YouTube position', () => {
  const video = 'https://www.youtube.com/watch?v=abc'

  it('suspends a video with its position, and opens it there', async () => {
    const { browser, suspender } = setup({
      clickToLoad: true,
      rememberVideoTime: true,
    })
    browser.addTab({ active: true })
    const tab = browser.addTab({ url: video })
    browser.videoTimes.set(tab.id, 754.2)
    await finished(suspender.suspendOthers(1))
    const suspended = browser.byUrl(`${video}&t=754s`)
    expect(suspended.placeholder).toBe(true)
    await suspender.unsuspendTab(suspended.id)
    expect(browser.byUrl(`${video}&t=754s`).placeholder).toBe(false)
  })

  it('leaves the address alone when switched off', async () => {
    const { browser, suspender } = setup({ clickToLoad: true })
    browser.addTab({ active: true })
    const tab = browser.addTab({ url: video })
    browser.videoTimes.set(tab.id, 754)
    await finished(suspender.suspendOthers(1))
    expect(browser.byUrl(video).placeholder).toBe(true)
  })
})
