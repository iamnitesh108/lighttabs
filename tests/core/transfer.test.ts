import { describe, expect, it } from 'vitest'
import { newSession } from '../../src/core/sessions.ts'
import {
  exportBackup,
  exportText,
  ImportError,
  parseImport,
} from '../../src/core/transfer.ts'

let counter = 0
const options = { now: 1_000, makeId: () => `id${++counter}` }

describe('OneTab text', () => {
  const onetab = [
    'https://go.dev/ | The Go Programming Language',
    'https://example.com/a | A title | with a bar',
    'chrome://settings/ | Browser page',
    '',
    'https://news.ycombinator.com/',
  ].join('\n')

  it("imports one list per group, skipping addresses that can't be reopened", () => {
    const sessions = parseImport(onetab, options)
    expect(sessions).toHaveLength(2)
    expect(sessions[0].tabs.map((t) => t.title)).toEqual([
      'The Go Programming Language',
      'A title | with a bar',
    ])
    expect(sessions[1].tabs[0]).toMatchObject({
      url: 'https://news.ycombinator.com/',
      title: 'https://news.ycombinator.com/',
    })
    // Newest first keeps the file's order.
    expect(sessions[0].createdAt).toBeGreaterThan(sessions[1].createdAt)
  })

  it('exports in the same format, so it round-trips', () => {
    const sessions = parseImport(onetab, options)
    const again = parseImport(exportText(sessions), options)
    expect(again.map((s) => s.tabs.map((t) => t.url))).toEqual(
      sessions.map((s) => s.tabs.map((t) => t.url)),
    )
  })
})

describe('LightTabs backup', () => {
  it('keeps names, dates and locks, with new ids', () => {
    const original = {
      ...newSession([{ url: 'https://a.com', title: 'A' }], {
        ...options,
        skipDuplicates: true,
        name: 'Work',
      }),
      locked: true,
    }
    const [restored] = parseImport(exportBackup([original], 5), options)
    expect(restored).toMatchObject({
      name: 'Work',
      locked: true,
      createdAt: original.createdAt,
    })
    expect(restored.id).not.toBe(original.id)
    expect(restored.tabs[0]).toMatchObject({ url: 'https://a.com', title: 'A' })
  })

  it('rejects files that are not backups', () => {
    expect(() => parseImport('{"hello": 1}', options)).toThrow(ImportError)
    expect(() => parseImport('{broken', options)).toThrow('not valid JSON')
    expect(() => parseImport('   ', options)).toThrow('empty')
    expect(() => parseImport('just some words', options)).toThrow(
      'No tabs found',
    )
  })
})
