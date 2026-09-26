import { describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings } from '../../src/core/settings.ts'

describe('normalizeSettings', () => {
  it('uses the defaults for missing or broken storage', () => {
    expect(normalizeSettings(undefined)).toEqual(defaultSettings)
    expect(normalizeSettings('garbage')).toEqual(defaultSettings)
    expect(normalizeSettings([1, 2])).toEqual(defaultSettings)
  })

  it('keeps valid values and replaces wrong types with defaults', () => {
    const settings = normalizeSettings({
      suspendAfterMinutes: 60,
      keepPinned: false,
      keepAudible: 'yes',
      unknownOldSetting: true,
    })
    expect(settings.suspendAfterMinutes).toBe(60)
    expect(settings.keepPinned).toBe(false)
    expect(settings.keepAudible).toBe(defaultSettings.keepAudible)
    expect(settings).not.toHaveProperty('unknownOldSetting')
  })

  it('only accepts timer values the settings page offers', () => {
    expect(
      normalizeSettings({ suspendAfterMinutes: 7 }).suspendAfterMinutes,
    ).toBe(30)
    expect(
      normalizeSettings({ suspendAfterMinutes: 0 }).suspendAfterMinutes,
    ).toBe(0)
  })

  it('cleans, de-duplicates and sorts site rules', () => {
    const { neverSuspendSites } = normalizeSettings({
      neverSuspendSites: [
        'https://www.YouTube.com/watch?v=1',
        'youtube.com',
        'not a site!',
        42,
        'mail.google.com',
      ],
    })
    expect(neverSuspendSites).toEqual(['mail.google.com', 'youtube.com'])
  })
})
