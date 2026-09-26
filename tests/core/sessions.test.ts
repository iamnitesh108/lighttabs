import { describe, expect, it } from 'vitest'
import {
  newSession,
  searchSessions,
  sortSessions,
  tabsWithGroups,
  withoutTab,
} from '../../src/core/sessions.ts'

let counter = 0
const makeId = () => `id${++counter}`

describe('newSession', () => {
  it('skips duplicate addresses when asked, and falls back to the URL as title', () => {
    const tabs = [
      { url: 'https://a.com', title: 'A' },
      { url: 'https://a.com', title: 'A again' },
      { url: 'https://b.com', title: '  ' },
    ]
    const session = newSession(tabs, { now: 5, makeId, skipDuplicates: true })
    expect(session.tabs.map((t) => [t.url, t.title])).toEqual([
      ['https://a.com', 'A'],
      ['https://b.com', 'https://b.com'],
    ])
    expect(session).toMatchObject({ createdAt: 5, locked: false, name: '' })
    expect(
      newSession(tabs, { now: 5, makeId, skipDuplicates: false }).tabs,
    ).toHaveLength(3)
  })
})

describe('lists', () => {
  const older = newSession([{ url: 'https://docs.rs', title: 'Rust docs' }], {
    now: 1,
    makeId,
    skipDuplicates: true,
  })
  const newer = newSession(
    [
      { url: 'https://go.dev/doc', title: 'Go documentation' },
      { url: 'https://news.ycombinator.com', title: 'Hacker News' },
    ],
    { now: 2, makeId, skipDuplicates: true, name: 'Reading' },
  )

  it('sort newest first', () => {
    expect(sortSessions([older, newer]).map((s) => s.createdAt)).toEqual([2, 1])
  })

  it('remove one tab', () => {
    expect(
      withoutTab(newer, newer.tabs[0].id).tabs.map((t) => t.title),
    ).toEqual(['Hacker News'])
  })

  it('search titles and addresses with every word, case-insensitive', () => {
    const found = searchSessions([older, newer], 'go DOC')
    expect(found).toHaveLength(1)
    expect(found[0].tabs.map((t) => t.title)).toEqual(['Go documentation'])
    expect(searchSessions([older, newer], 'ycombinator')[0].tabs).toHaveLength(
      1,
    )
    expect(searchSessions([older, newer], 'nothing-like-this')).toEqual([])
  })

  it('search list names too, keeping all of their tabs', () => {
    expect(searchSessions([older, newer], 'reading')[0].tabs).toHaveLength(2)
  })
})

describe('tab groups in lists', () => {
  const work = { title: 'Work', color: 'blue' as const, collapsed: false }

  it('keeps one saved group per browser group, in tab order', () => {
    let n = 0
    const session = newSession(
      [
        { url: 'https://a.com/', title: 'A', group: { ...work, key: 7 } },
        { url: 'https://b.com/', title: 'B' },
        { url: 'https://c.com/', title: 'C', group: { ...work, key: 7 } },
      ],
      { now: 1, makeId: () => `id${++n}`, skipDuplicates: false },
    )
    expect(session.groups).toEqual([{ id: 'id1', ...work }])
    expect(
      tabsWithGroups(session).map(({ tab, group }) => [
        tab.title,
        group?.title,
      ]),
    ).toEqual([
      ['A', 'Work'],
      ['B', undefined],
      ['C', 'Work'],
    ])
  })

  it('drops a group when its last tab is removed', () => {
    let n = 0
    const session = newSession(
      [{ url: 'https://a.com/', title: 'A', group: { ...work, key: 1 } }],
      { now: 1, makeId: () => `id${++n}`, skipDuplicates: false },
    )
    expect(withoutTab(session, session.tabs[0].id).groups).toEqual([])
  })
})
