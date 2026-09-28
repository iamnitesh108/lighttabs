import { describe, expect, it } from 'vitest'
import { OverviewOrder } from '../../src/background/overview-order.ts'
import type { Arrangement } from '../../src/core/overview.ts'
import { FakeBrowser, MemoryValue } from '../support/fakes.ts'

function setup() {
  const browser = new FakeBrowser()
  const store = new MemoryValue<Arrangement>()
  return { browser, store, order: new OverviewOrder(browser, store) }
}

describe('OverviewOrder', () => {
  it("saves a group's cards in their new order and forgets closed tabs", async () => {
    const { browser, store, order } = setup()
    const [a, b, c] = [browser.addTab(), browser.addTab(), browser.addTab()]
    store.value = { cards: [99, a.id], items: [] } // 99 has closed

    await order.arrangeCards([c.id, b.id])
    expect(store.value?.cards).toEqual([a.id, c.id, b.id])
  })

  it("saves a window's tabs and groups and forgets closed groups", async () => {
    const { browser, store, order } = setup()
    const a = browser.addTab()
    browser.addTab({ groupId: 7 })
    store.value = { cards: [], items: ['group:3'] } // group 3 has closed

    await order.arrangeItems(['group:7', `tab:${a.id}`])
    expect(store.value?.items).toEqual(['group:7', `tab:${a.id}`])
  })

  it('keeps the place of a tab that got a new id when suspended', async () => {
    const { browser, store, order } = setup()
    const [a, b] = [browser.addTab(), browser.addTab()]
    browser.addTab({ groupId: 7 })
    await order.arrangeCards([b.id, a.id])
    await order.arrangeItems(['group:7', `tab:${a.id}`])
    await browser.discard(a.id)
    const [[newId]] = browser.replaced

    await order.tabReplaced(newId, a.id)
    expect(store.value).toEqual({
      cards: [b.id, newId],
      items: ['group:7', `tab:${newId}`],
    })
  })

  it("doesn't write when the replaced tab was never moved", async () => {
    const { store, order } = setup()
    let writes = 0
    store.update = async () => void writes++
    await order.tabReplaced(5, 4)
    expect(writes).toBe(0)
  })

  it('goes back to tab strip order', async () => {
    const { browser, store, order } = setup()
    const a = browser.addTab()
    await order.arrangeCards([a.id])
    await order.arrangeItems([`tab:${a.id}`])
    await order.reset()
    expect(store.value).toEqual({ cards: [], items: [] })
  })
})
