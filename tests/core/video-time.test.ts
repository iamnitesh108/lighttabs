import { describe, expect, it } from 'vitest'
import {
  hasVideoTime,
  isYouTubeVideo,
  withVideoTime,
} from '../../src/core/video-time.ts'

describe('video time', () => {
  it('recognises YouTube video pages only', () => {
    expect(isYouTubeVideo('https://www.youtube.com/watch?v=abc')).toBe(true)
    expect(isYouTubeVideo('https://m.youtube.com/watch?v=abc&list=x')).toBe(
      true,
    )
    expect(isYouTubeVideo('https://www.youtube.com/')).toBe(false)
    expect(isYouTubeVideo('https://notyoutube.com/watch?v=abc')).toBe(false)
  })

  it('adds or replaces the position, and skips the first seconds', () => {
    const url = 'https://www.youtube.com/watch?v=abc&t=10s'
    expect(withVideoTime(url, 754.6)).toBe(
      'https://www.youtube.com/watch?v=abc&t=754s',
    )
    expect(withVideoTime(url, 3)).toBe(url)
    expect(withVideoTime('https://example.com/', 100)).toBe(
      'https://example.com/',
    )
    expect(hasVideoTime(withVideoTime(url, 754))).toBe(true)
    expect(hasVideoTime('https://www.youtube.com/watch?v=abc')).toBe(false)
  })
})
