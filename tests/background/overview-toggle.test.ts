import { describe, expect, it } from 'vitest'
import { OverviewToggle } from '../../src/background/overview-toggle.ts'
import { Pages } from '../../src/background/pages.ts'
import type { Target } from '../../src/background/tab-actions.ts'
import { FakeBrowser, MemoryValue, testOrigin } from '../support/fakes.ts'

function setup() {
  const browser = new FakeBrowser()
  const pages = new Pages(browser, testOrigin)
  const toggle = new OverviewToggle(browser, pages, new MemoryValue<Target>())
  const front = () => browser.tabs.find((t) => t.active)!
  return { browser, pages, toggle, front }
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

  it('goes back to a tab in another window, and focuses that window', async () => {
    const { browser, pages, toggle, front } = setup()
    const overview = browser.addTab({ url: pages.overviewUrl, windowId: 1 })
    const google = browser.addTab({ windowId: 2, active: true })

    await toggle.toggle({ tabId: google.id, windowId: 2 }) // reuses the open overview
    expect(browser.focused).toBe(1)
    await toggle.toggle({ tabId: overview.id, windowId: 1 })

    expect(browser.tabs.find((t) => t.windowId === 2 && t.active)?.id).toBe(
      google.id,
    )
    expect(browser.focused).toBe(2)
    expect(front().id).toBe(overview.id) // window 1 keeps its own front tab
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
