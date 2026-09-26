import { describe, expect, it } from 'vitest'
import {
  parseAnyPlaceholder,
  parsePlaceholder,
  placeholderUrl,
  withRealAddress,
} from '../../src/core/placeholder.ts'

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

describe('suspended tabs of other installs', () => {
  const oldBase =
    'chrome-extension://iipbehlicbejmbjbaeiamloojljanlff/ui/suspended/suspended.html'
  const gmail = 'https://mail.google.com/mail/u/0/#inbox'

  it('finds the page behind an older LightTabs address', () => {
    const url = placeholderUrl(oldBase, { url: gmail, title: 'Inbox' })
    expect(parseAnyPlaceholder(url)).toEqual({ url: gmail, title: 'Inbox' })
  })

  it('ignores other extension pages and unsafe addresses', () => {
    for (const url of [
      'chrome-extension://iipbehlicbejmbjbaeiamloojljanlff/ui/saved/saved.html',
      'chrome-extension://iipbehlicbejmbjbaeiamloojljanlff/suspended.html#ttl=x&uri=https://a.com/',
      `${oldBase}#${new URLSearchParams({ url: 'chrome://settings/' })}`,
      'https://a.com/ui/suspended/suspended.html#url=https://b.com/',
    ])
      expect(parseAnyPlaceholder(url)).toBeNull()
  })

  it('repairs a saved tab, taking the title when it was only the address', () => {
    const url = placeholderUrl(oldBase, { url: gmail, title: 'Inbox' })
    expect(withRealAddress({ id: '1', url, title: 'Mail' })).toEqual({
      id: '1',
      url: gmail,
      title: 'Mail',
    })
    expect(withRealAddress({ url, title: url })).toEqual({
      url: gmail,
      title: 'Inbox',
    })
    const plain = { url: 'https://a.com/', title: 'A' }
    expect(withRealAddress(plain)).toBe(plain)
  })
})
