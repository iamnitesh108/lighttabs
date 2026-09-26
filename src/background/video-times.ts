import type { TabInfo } from '../core/tab.ts'
import { isYouTubeVideo, withVideoTime } from '../core/video-time.ts'
import type { Browser } from '../platform/browser.ts'
import type { SettingsSource } from './ports.ts'

/**
 * Adds a YouTube video's position to its address before the tab is
 * suspended or saved, so it starts where it was. Only when the user turned
 * it on, and only for loaded YouTube tabs; anything else keeps its address.
 */
export class VideoTimes {
  private readonly browser: Browser
  private readonly settings: SettingsSource

  constructor(browser: Browser, settings: SettingsSource) {
    this.browser = browser
    this.settings = settings
  }

  async addressWithTime(tab: TabInfo): Promise<string> {
    if (!isYouTubeVideo(tab.url) || tab.discarded || tab.placeholder)
      return tab.url
    if (!(await this.settings.get()).rememberVideoTime) return tab.url
    const seconds = await this.browser.videoTime(tab.id)
    return seconds === null ? tab.url : withVideoTime(tab.url, seconds)
  }
}
