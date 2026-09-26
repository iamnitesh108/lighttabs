import { describe, expect, it } from 'vitest'
import {
  excludingRule,
  isSiteExcluded,
  normalizeSiteRule,
  siteOf,
} from '../../src/core/sites.ts'

describe('siteOf', () => {
  it.each([
    ['https://www.youtube.com/watch?v=1', 'youtube.com'],
    ['http://Mail.Google.com:8080/x', 'mail.google.com'],
    ['file:///home/me/a.pdf', null],
    ['chrome://settings', null],
    ['not a url', null],
  ])('%s → %s', (url, site) => {
    expect(siteOf(url)).toBe(site)
  })
})

describe('normalizeSiteRule', () => {
  it.each([
    ['youtube.com', 'youtube.com'],
    ['  WWW.YouTube.com  ', 'youtube.com'],
    ['https://docs.google.com/document/d/1', 'docs.google.com'],
    ['', null],
    ['not a site', null],
    ['.com', null],
  ])('%j → %j', (input, rule) => {
    expect(normalizeSiteRule(input)).toBe(rule)
  })
})

describe('site rules', () => {
  const rules = ['google.com', 'youtube.com']

  it('cover the site and its subdomains, but not look-alikes', () => {
    expect(isSiteExcluded('https://mail.google.com/inbox', rules)).toBe(true)
    expect(isSiteExcluded('https://google.com', rules)).toBe(true)
    expect(isSiteExcluded('https://notgoogle.com', rules)).toBe(false)
    expect(isSiteExcluded('https://google.com.evil.io', rules)).toBe(false)
  })

  it('find the rule to remove for a URL', () => {
    expect(excludingRule('https://music.youtube.com/', rules)).toBe(
      'youtube.com',
    )
    expect(excludingRule('https://example.com/', rules)).toBeNull()
  })
})
