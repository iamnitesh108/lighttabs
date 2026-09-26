/** YouTube pages where LightTabs may read the video's position. */
export const youTubeOrigins = [
  'https://www.youtube.com/*',
  'https://m.youtube.com/*',
]

/** A YouTube video page (youtu.be links end up on youtube.com/watch). */
export function isYouTubeVideo(url: string): boolean {
  try {
    const { hostname, pathname, searchParams } = new URL(url)
    return (
      /^(www\.|m\.)?youtube\.com$/.test(hostname) &&
      pathname === '/watch' &&
      searchParams.has('v')
    )
  } catch {
    return false
  }
}

/**
 * The video's address with its position, like YouTube's own "share at
 * current time" link. The first few seconds aren't worth a position.
 */
export function withVideoTime(url: string, seconds: number): string {
  if (!isYouTubeVideo(url) || seconds < 5) return url
  const address = new URL(url)
  address.searchParams.set('t', `${Math.floor(seconds)}s`)
  return address.toString()
}

/**
 * Whether the address says where to start the video. Such a tab must open
 * the address rather than go back in history: the earlier page has no
 * position in it.
 */
export function hasVideoTime(url: string): boolean {
  return isYouTubeVideo(url) && new URL(url).searchParams.has('t')
}
