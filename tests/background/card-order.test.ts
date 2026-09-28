import { describe, expect, it } from 'vitest'
import { CardOrder } from '../../src/background/card-order.ts'
import { FakeBrowser, MemoryValue } from '../support/fakes.ts'

function setup() {
  const browser = new FakeBrowser()
  const store = new MemoryValue<number[]>()
  return { browser, store, order: new CardOrder(browser, store) }
}

describe('CardOrder', () => {
  it('saves a section in its new order and forgets closed tabs', async () => {
    const { browser, store, order } = setup()
    const [a, b, c] = [browser.addTab(), browser.addTab(), browser.addTab()]
    store.value = [99, a.id] // 99 has closed

    await order.arrange([c.id, b.id])
    expect(store.value).toEqual([a.id, c.id, b.id])
  })

  it('keeps the place of a tab that got a new id when suspended', async () => {
    const { browser, store, order } = setup()
    const [a, b] = [browser.addTab(), browser.addTab()]
    await order.arrange([b.id, a.id])
    await browser.discard(b.id)
    const [[newId]] = browser.replaced

    await order.tabReplaced(newId, b.id)
    expect(store.value).toEqual([newId, a.id])
  })

  it("doesn't write when the replaced tab was never arranged", async () => {
    const { store, order } = setup()
    let writes = 0
    store.update = async () => void writes++
    await order.tabReplaced(5, 4)
    expect(writes).toBe(0)
  })

  it('goes back to tab strip order', async () => {
    const { browser, store, order } = setup()
    const a = browser.addTab()
    await order.arrange([a.id])
    await order.reset()
    expect(store.value).toEqual([])
  })
})
