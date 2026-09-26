import { describe, expect, it } from 'vitest'
import { parsePlaceholder, placeholderUrl } from '../../src/core/placeholder.ts'

const base = 'chrome-extension://abc/ui/suspended/suspended.html'

describe('placeholder addresses', () => {
  it('round-trips any title and address', () => {
    const page = {
      url: 'https://example.com/search?q=a&b=c#results',
      title: 'Results: "a & b" #1 — 100%',
    }
    const url = placeholderUrl(base, page)
    expect(url.startsWith(`${base}#`)).toBe(true)
    expect(parsePlaceholder(url, base)).toEqual(page)
  })

  it('remembers when the tab was suspended, when it knows', () => {
    const page = { url: 'https://a.com/', title: 'A', since: 1_790_000_000_000 }
    expect(parsePlaceholder(placeholderUrl(base, page), base)).toEqual(page)
    const old = `${base}#url=https%3A%2F%2Fa.com%2F&title=A`
    expect(parsePlaceholder(old, base)).toEqual({
      url: 'https://a.com/',
      title: 'A',
    })
  })

  it('ignores other addresses', () => {
    expect(parsePlaceholder('https://example.com/', base)).toBeNull()
    expect(
      parsePlaceholder(
        'chrome-extension://other/ui/suspended/suspended.html#url=https://a.com/',
        base,
      ),
    ).toBeNull()
  })

  it('never returns an address that could run code', () => {
    for (const url of ['javascript:alert(1)', 'chrome://settings/', '']) {
      const placeholder = `${base}#${new URLSearchParams({ url, title: 'x' })}`
      expect(parsePlaceholder(placeholder, base)).toBeNull()
    }
  })
})
