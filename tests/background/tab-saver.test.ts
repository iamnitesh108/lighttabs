import { describe, expect, it } from 'vitest'
import { Pages } from '../../src/background/pages.ts'
import { TabSaver } from '../../src/background/tab-saver.ts'
import type { Settings } from '../../src/core/settings.ts'
import {
  Clock,
  FakeBrowser,
  MemorySessions,
  MemorySettings,
} from '../support/fakes.ts'

const origin = 'chrome-extension://abc/'
const savedPage = `${origin}ui/saved/saved.html`

function setup(settings: Partial<Settings> = {}) {
  const clock = new Clock()
  const browser = new FakeBrowser()
  const sessions = new MemorySessions()
  const store = new MemorySettings(settings)
  let n = 0
  const saver = new TabSaver({
    browser,
    sessions,
    settings: store,
    pages: new Pages(browser, origin),
    now: clock.now,
    makeId: () => `id${++n}`,
  })
  return { browser, sessions, saver }
}

describe('saving', () => {
  it("saves a window's tabs, keeps pinned ones, and opens the saved page before closing", async () => {
    const { browser, sessions, saver } = setup()
    browser.addTab({ url: 'https://pinned.com/', pinned: true })
    browser.addTab({ url: 'https://a.com/', title: 'A', active: true })
    browser.addTab({ url: 'https://a.com/', title: 'A copy' })
    browser.addTab({ url: 'chrome://newtab/' })
    browser.addTab({ url: `${origin}ui/options/options.html` })
    browser.addTab({ url: 'https://other-window.com/', windowId: 2 })

    expect(await saver.saveWindow(1)).toBe(1) // the duplicate is skipped
    const [session] = await sessions.list()
    expect(session.tabs.map((t) => t.url)).toEqual(['https://a.com/'])

    const left = browser.tabs.map((t) => t.url)
    expect(left).toEqual([
      'https://pinned.com/',
      `${origin}ui/options/options.html`,
      'https://other-window.com/',
      savedPage,
    ])
  })

  it('keeps the window open with a blank tab when the saved page is turned off', async () => {
    const { browser, saver } = setup({ openSavedPageAfterSaving: false })
    browser.addTab({ url: 'https://a.com/', active: true })
    await saver.saveWindow(1)
    expect(browser.tabs.map((t) => t.url)).toEqual(['about:blank'])
  })

  it('refuses when there is nothing to save', async () => {
    const { browser, saver } = setup()
    browser.addTab({ url: 'chrome://newtab/', active: true })
    await expect(saver.saveWindow(1)).rejects.toThrow('no tabs to save')
  })
})

async function saved(settings: Partial<Settings> = {}) {
  const ctx = setup(settings)
  ctx.browser.addTab({ url: 'https://keep.com/', active: true, pinned: true })
  ctx.browser.addTab({ url: 'https://a.com/' })
  ctx.browser.addTab({ url: 'https://b.com/' })
  await ctx.saver.saveWindow(1)
  const [session] = await ctx.sessions.list()
  return { ...ctx, session }
}

describe('restoring', () => {
  it('reopens every tab as a suspended-tab page, then removes the list', async () => {
    const { browser, sessions, saver, session } = await saved()
    await saver.restoreSession(session.id, 1, false)
    const restored = browser.tabs.filter((t) =>
      ['https://a.com/', 'https://b.com/'].includes(t.url),
    )
    expect(restored).toHaveLength(2)
    expect(restored.every((t) => t.placeholder)).toBe(true)
    expect(restored.map((t) => t.title)).toEqual(
      session.tabs.map((t) => t.title),
    )
    expect(await sessions.list()).toEqual([])
  })

  it("discards them instead with the browser's own discarding", async () => {
    const { browser, saver, session } = await saved({ clickToLoad: false })
    await saver.restoreSession(session.id, 1, false)
    const restored = browser.tabs.filter((t) =>
      ['https://a.com/', 'https://b.com/'].includes(t.url),
    )
    expect(restored.every((t) => t.discarded && !t.placeholder)).toBe(true)
  })

  it('loads them normally when asked, and keeps locked lists', async () => {
    const { browser, sessions, saver, session } = await saved({
      restoreWithoutLoading: false,
    })
    await saver.lockSession(session.id, true)
    await saver.restoreSession(session.id, 1, false)
    expect(
      browser.tabs.filter((t) => t.url === 'https://a.com/')[0].discarded,
    ).toBe(false)
    expect(await sessions.list()).toHaveLength(1)
  })

  it('opens a list in a new window', async () => {
    const { browser, saver, session } = await saved()
    await saver.restoreSession(session.id, 1, true)
    const newWindow = browser.tabs.filter((t) => t.windowId === 2)
    expect(newWindow.map((t) => t.url)).toEqual([
      'https://a.com/',
      'https://b.com/',
    ])
  })

  it('restores one tab and takes it off the list', async () => {
    const { sessions, saver, session } = await saved()
    await saver.restoreTab(session.id, session.tabs[0].id, 1)
    expect((await sessions.get(session.id))!.tabs.map((t) => t.url)).toEqual([
      'https://b.com/',
    ])
  })

  it('protects locked lists from edits and deletion', async () => {
    const { saver, session } = await saved()
    await saver.lockSession(session.id, true)
    await expect(
      saver.removeTab(session.id, session.tabs[0].id),
    ).rejects.toThrow('Unlock')
    await expect(saver.deleteSession(session.id)).rejects.toThrow('Unlock')
  })
})

describe('import', () => {
  it('adds lists from a OneTab export and reports what it added', async () => {
    const { sessions, saver } = setup()
    const result = await saver.import(
      'https://a.com | A\nhttps://b.com | B\n\nhttps://c.com | C',
    )
    expect(result).toEqual({ lists: 2, tabs: 3 })
    expect(await sessions.list()).toHaveLength(2)
  })

  it('turns parse problems into messages for the user', async () => {
    const { saver } = setup()
    await expect(saver.import('')).rejects.toThrow('The file is empty.')
  })
})
