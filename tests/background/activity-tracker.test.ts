import { describe, expect, it } from 'vitest'
import { ActivityTracker } from '../../src/background/activity-tracker.ts'
import { Clock, FakeBrowser, MemoryActivity } from '../support/fakes.ts'

function setup() {
  const clock = new Clock()
  const store = new MemoryActivity()
  return { clock, store, tracker: new ActivityTracker(store, clock.now) }
}

describe('ActivityTracker', () => {
  it("starts a background tab's idle time when you leave it", async () => {
    const { clock, store, tracker } = setup()
    await tracker.tabActivated(1, 10)
    clock.advanceMinutes(20) // reading tab 1 for 20 minutes
    await tracker.tabActivated(2, 10)
    expect(store.value.lastActive[1]).toBe(clock.time) // left just now, not 20 minutes ago
    expect(store.value.frontTab[10]).toBe(2)
  })

  it('forgets closed tabs', async () => {
    const { store, tracker } = setup()
    await tracker.tabActivated(1, 10)
    await tracker.togglePause(1)
    await tracker.tabClosed(1)
    expect(store.value).toEqual({ lastActive: {}, frontTab: {}, paused: [] })
  })

  it('gives tabs seen for the first time a full timer', async () => {
    const { clock, store, tracker } = setup()
    const browser = new FakeBrowser()
    const tab = browser.addTab()
    const snapshot = await tracker.snapshot([tab])
    expect(snapshot.lastActive(tab.id)).toBe(clock.time)
    expect(store.value.lastActive[tab.id]).toBe(clock.time)
  })

  it('restarts every clock on reset, keeping only pauses of open tabs', async () => {
    const { clock, store, tracker } = setup()
    const browser = new FakeBrowser()
    const a = browser.addTab({ active: true })
    const b = browser.addTab()
    await tracker.togglePause(b.id)
    await tracker.togglePause(999)
    clock.advanceMinutes(5)
    await tracker.reset(browser.tabs)
    expect(store.value.lastActive).toEqual({
      [a.id]: clock.time,
      [b.id]: clock.time,
    })
    expect(store.value.frontTab).toEqual({ 1: a.id })
    expect(store.value.paused).toEqual([b.id])
  })

  it('toggles pause on and off', async () => {
    const { tracker } = setup()
    expect(await tracker.togglePause(7)).toBe(true)
    expect(await tracker.togglePause(7)).toBe(false)
  })

  it("keeps a replaced tab's history", async () => {
    const { store, tracker } = setup()
    await tracker.tabActivated(1, 10)
    await tracker.togglePause(1)
    await tracker.tabReplaced(2, 1)
    expect(store.value.lastActive[2]).toBeDefined()
    expect(store.value.lastActive[1]).toBeUndefined()
    expect(store.value.paused).toEqual([2])
  })
})
