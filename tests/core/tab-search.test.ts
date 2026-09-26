import { describe, expect, it } from 'vitest'
import {
  matchRanges,
  searchScore,
  searchWords,
} from '../../src/core/tab-search.ts'

const tabs = [
  { title: 'Trust and safety', url: 'https://example.com/trust' },
  { title: 'The Rust book', url: 'https://doc.rust-lang.org/book/' },
  { title: 'Rust Playground', url: 'https://play.rust-lang.org/' },
  { title: 'Inbox', url: 'https://mail.google.com/mail/u/0/' },
  { title: 'GitHub', url: 'https://github.com/' },
]

function ranked(query: string): string[] {
  const words = searchWords(query)
  return tabs
    .map((tab) => ({ tab, score: searchScore(tab, words) }))
    .filter((r) => r.score !== null)
    .toSorted((a, b) => b.score! - a.score!)
    .map((r) => r.tab.title)
}

describe('searchScore', () => {
  it('ranks a title that starts with the word first, then word starts, then the middle', () => {
    expect(ranked('rust')).toEqual([
      'Rust Playground',
      'The Rust book',
      'Trust and safety',
    ])
  })

  it('finds tabs by site, and never by "https://www."', () => {
    expect(ranked('mail')).toEqual(['Inbox'])
    expect(ranked('https')).toEqual([])
    expect(ranked('www')).toEqual([])
  })

  it('needs every word, and allows scattered letters of the title', () => {
    expect(ranked('rust book')).toEqual(['The Rust book'])
    expect(ranked('gthb')).toEqual(['GitHub'])
  })
})

describe('matchRanges', () => {
  it('marks each word once, merging overlaps', () => {
    expect(matchRanges('The Rust book', ['rust', 'us'])).toEqual([[4, 8]])
    expect(matchRanges('The Rust book', ['book', 'the'])).toEqual([
      [0, 3],
      [9, 13],
    ])
  })
})
