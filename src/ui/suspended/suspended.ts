import { parsePlaceholder } from '../../core/placeholder.ts'
import { byId } from '../shared/dom.ts'
import { faviconUrl } from '../shared/favicon.ts'

/** How visible the site's icon is in the tab strip, so suspended tabs stand out. */
const iconOpacity = 0.5
const iconSize = 32

const page = parsePlaceholder(
  location.href,
  location.origin + location.pathname,
)
const button = byId<HTMLButtonElement>('load')

if (page) {
  document.title = page.title || page.url
  byId('title').textContent = page.title || page.url
  byId('address').textContent = page.url
  showIcon(page.url)
  button.addEventListener('click', () => load(page.url), { once: true })
} else {
  byId('title').textContent = 'This suspended tab has no address to load.'
  button.disabled = true
}

/** How long to wait for going back to start before opening the address instead. */
const backTimeoutMs = 1000

/**
 * This page was opened on top of the site, so going back brings the site
 * back as you left it, scroll position included. The page does it itself:
 * the browser's back button (and chrome.tabs.goBack) skips pages you never
 * clicked or typed in, but history.back() from the page doesn't.
 *
 * A tab restored from a saved list has no earlier page, so it opens the
 * address; so does any tab where going back doesn't start.
 */
function load(url: string): void {
  if (history.length < 2) {
    location.replace(url)
    return
  }
  const fallback = setTimeout(() => location.replace(url), backTimeoutMs)
  addEventListener('beforeunload', () => clearTimeout(fallback), {
    once: true,
  })
  history.back()
}

/**
 * Shows the site's icon on the page, and a faded copy of it as the tab's
 * icon. The icon comes from the browser's own cache, so the site isn't
 * contacted. The page's load event waits for the image, and the background
 * discards the page once the tab's icon changes, so the faded icon is what
 * stays in the tab strip.
 */
function showIcon(url: string): void {
  const image = byId<HTMLImageElement>('site-icon')
  image.addEventListener(
    'load',
    () => {
      const canvas = document.createElement('canvas')
      canvas.width = iconSize
      canvas.height = iconSize
      const context = canvas.getContext('2d')
      if (!context) return
      context.globalAlpha = iconOpacity
      context.drawImage(image, 0, 0, iconSize, iconSize)
      const link = document.createElement('link')
      link.rel = 'icon'
      link.href = canvas.toDataURL('image/png')
      document.head.append(link)
    },
    { once: true },
  )
  image.src = faviconUrl(url, iconSize)
}
