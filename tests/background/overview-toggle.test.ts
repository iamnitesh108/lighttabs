import { describe, expect, it } from 'vitest'
import { OverviewToggle } from '../../src/background/overview-toggle.ts'
import { Pages } from '../../src/background/pages.ts'
import type { Target } from '../../src/background/tab-actions.ts'
import { FakeBrowser, MemoryValue, testOrigin } from '../support/fakes.ts'

function setup() {
  const browser = new FakeBrowser()
  const pages = new Pages(browser, testOrigin)
  const toggle = new OverviewToggle(
    browser,
    pages,
    new MemoryValue<Record<string, Target>>(),
  )
  const front = (windowId = 1) =>
    browser.tabs.find((t) => t.windowId === windowId && t.active)!
  const overviews = () =>
    browser.tabs.filter((t) => t.url === pages.overviewUrl)
  return { browser, pages, toggle, front, overviews }
}

describe('OverviewToggle', () => {
  it('opens the overview, then goes back to the tab it came from', async () => {
    const { browser, pages, toggle, front } = setup()
    browser.addTab()
    const google = browser.addTab({ active: true })

    await toggle.toggle({ tabId: google.id, windowId: 1 })
    expect(front().url).toBe(pages.overviewUrl)

    await toggle.toggle({ tabId: front().id, windowId: 1 })
    expect(front().id).toBe(google.id)
  })

  it('reuses the overview already open in the window', async () => {
    const { browser, toggle, front, overviews } = setup()
    const google = browser.addTab({ active: true })
    await toggle.toggle({ tabId: google.id, windowId: 1 })
    await toggle.toggle({ tabId: front().id, windowId: 1 })

    await toggle.toggle({ tabId: google.id, windowId: 1 })
    expect(overviews()).toHaveLength(1)
  })

  it('shows each window its own overview, and each goes back to its own tab', async () => {
    const { browser, pages, toggle, front, overviews } = setup()
    const one = browser.addTab({ windowId: 1, active: true })
    const two = browser.addTab({ windowId: 2, active: true })

    await toggle.toggle({ tabId: one.id, windowId: 1 })
    await toggle.toggle({ tabId: two.id, windowId: 2 })
    expect(overviews().map((t) => t.windowId)).toEqual([1, 2])
    expect(front(2).url).toBe(pages.overviewUrl)

    await toggle.toggle({ tabId: front(1).id, windowId: 1 })
    expect(front(1).id).toBe(one.id)
    expect(front(2).url).toBe(pages.overviewUrl) // window 2 is left as it is
    await toggle.toggle({ tabId: front(2).id, windowId: 2 })
    expect(front(2).id).toBe(two.id)
  })

  it('stays on the overview when the tab it came from has closed', async () => {
    const { browser, toggle, front } = setup()
    const google = browser.addTab({ active: true })
    await toggle.toggle({ tabId: google.id, windowId: 1 })
    const overview = front()
    await browser.removeTabs([google.id])

    await toggle.toggle({ tabId: overview.id, windowId: 1 })
    expect(front().id).toBe(overview.id)
  })
})
