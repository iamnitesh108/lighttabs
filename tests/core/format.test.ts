import { describe, expect, it } from 'vitest'
import { formatMinutes, formatSavedAt, plural } from '../../src/core/format.ts'

describe('format', () => {
  it.each([
    [5, '5 min'],
    [30, '30 min'],
    [120, '2 h'],
    [1440, '1 day'],
  ])('%d minutes → %s', (minutes, text) => {
    expect(formatMinutes(minutes)).toBe(text)
  })

  it('shows today, yesterday, or the date', () => {
    const now = new Date(2026, 8, 26, 16, 0).getTime()
    expect(formatSavedAt(new Date(2026, 8, 26, 9, 5).getTime(), now)).toBe(
      'Today, 09:05',
    )
    expect(formatSavedAt(new Date(2026, 8, 25, 23, 59).getTime(), now)).toBe(
      'Yesterday, 23:59',
    )
    expect(formatSavedAt(new Date(2026, 8, 20, 8, 0).getTime(), now)).toBe(
      '20 Sep 2026, 08:00',
    )
  })

  it('pluralises', () => {
    expect(plural(1, 'tab')).toBe('1 tab')
    expect(plural(3, 'tab')).toBe('3 tabs')
  })
})
