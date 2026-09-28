import { plural } from '../../core/format.ts'
import type { TabSection } from '../../core/overview.ts'
import { cardOrderKey, isArranged, overviewOf } from '../../core/overview.ts'
import { placeholderPath } from '../../core/placeholder.ts'
import type { GroupInfo } from '../../core/sessions.ts'
import type { TabInfo } from '../../core/tab.ts'
import { isSuspended } from '../../core/tab.ts'
import { matchRanges, searchScore, searchWords } from '../../core/tab-search.ts'
import { ChromeBrowser } from '../../platform/browser.ts'
import { SessionValue } from '../../platform/session-value.ts'
import { send } from '../../shared/messages.ts'
import { byId, el } from '../shared/dom.ts'
import { faviconUrl } from '../shared/favicon.ts'
import { groupColorValues } from '../shared/group-color.ts'

// Everything here happens only while this page is open: it reads the tabs
// when it opens, and again only when a tab changes. Searching works on the
// tabs already read, so typing never waits for the browser.

const browser = new ChromeBrowser(chrome.runtime.getURL(placeholderPath))
const windowsElement = byId('windows')
const resultsElement = byId('results')
const emptyElement = byId('empty')
const search = byId<HTMLInputElement>('search')
const resetOrder = byId<HTMLButtonElement>('reset-order')
/** Read here; only the background writes it. */
const savedOrder = new SessionValue<number[]>(cardOrderKey)

let tabs: TabInfo[] = []
let groups = new Map<number, GroupInfo>()
/** The tabs matching the search, best first, and the one Enter opens. */
let results: TabInfo[] = []
let selected = 0
let ownTabId: number | undefined

/** Reads the tabs again and redraws. */
async function refresh(): Promise<void> {
  tabs = (await browser.queryTabs()).filter((t) => t.id !== ownTabId)
  groups = await groupsOf(tabs)
  const order = (await savedOrder.get()) ?? []
  const windows = overviewOf(tabs, order)
  resetOrder.hidden = !isArranged(tabs, order)
  const suspended = tabs.filter(isSuspended).length
  byId('summary').textContent = [
    plural(tabs.length, 'tab'),
    windows.length > 1 ? `${windows.length} windows` : '',
    suspended ? `${suspended} suspended` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  windowsElement.replaceChildren(
    ...windows.map((window, i) => {
      const count = window.sections.reduce((n, s) => n + s.tabs.length, 0)
      return el(
        'section',
        { class: 'window' },
        windows.length > 1 &&
          el(
            'h2',
            { class: 'window-title' },
            `Window ${i + 1} · ${plural(count, 'tab')}`,
          ),
        ...window.sections.map(renderSection),
      )
    }),
  )
  showSearch()
}

/** Shows everything grouped, or, while searching, the matches best first. */
function showSearch(): void {
  const words = searchWords(search.value)
  const searching = words.length > 0
  const previous = results[selected]?.id
  results = searching
    ? tabs
        .map((tab) => ({ tab, score: searchScore(tab, words) }))
        .filter((r): r is { tab: TabInfo; score: number } => r.score !== null)
        .toSorted((a, b) => b.score - a.score) // stable: ties keep tab order
        .map((r) => r.tab)
    : []
  // Keep the selection on the same tab when the list is redrawn.
  selected = Math.max(
    0,
    results.findIndex((t) => t.id === previous),
  )

  windowsElement.hidden = searching
  resultsElement.hidden = !searching
  if (searching) {
    resultsElement.replaceChildren(
      ...results.map((tab, i) => renderCard(tab, words, i === selected)),
    )
  }
  const empty = searching ? results.length === 0 : tabs.length === 0
  emptyElement.hidden = !empty
  emptyElement.textContent = searching ? 'No tabs match.' : 'No other tabs.'
}

function renderSection(section: TabSection): HTMLElement {
  const grid = el(
    'div',
    { class: 'cards' },
    ...section.tabs.map((tab) => {
      const card = renderCard(tab, [], false)
      card.draggable = true // search results keep their best-first order
      return card
    }),
  )
  const group = groups.get(section.groupId)
  if (!group) return el('div', { class: 'section' }, grid)
  return el(
    'div',
    {
      class: 'section group',
      style: `--group-color: ${groupColorValues[group.color]}`,
    },
    el(
      'h3',
      { class: 'group-title' },
      el('span', { class: 'dot' }),
      group.title || 'Tab group',
      el('span', { class: 'muted' }, plural(section.tabs.length, 'tab')),
    ),
    grid,
  )
}

function renderCard(
  tab: TabInfo,
  words: readonly string[],
  isSelected: boolean,
): HTMLElement {
  const title = tab.title || tab.url
  const group = groups.get(tab.groupId)
  const details = [
    hostOf(tab.url),
    isSuspended(tab) && 'Suspended',
    tab.audible && 'Playing',
    tab.pinned && 'Pinned',
  ].filter(Boolean)
  const classes = [
    'card',
    isSuspended(tab) && 'suspended',
    isSelected && 'selected',
  ]
  // Two buttons side by side: a button can't hold another one.
  return el(
    'div',
    {
      class: classes.filter(Boolean).join(' '),
      'data-tab': tab.id,
      'data-window': tab.windowId,
      'data-index': tab.index,
      'data-url': tab.url,
    },
    el(
      'button',
      {
        class: 'card-open',
        type: 'button',
        'aria-current': tab.active ? 'true' : undefined,
        title: tab.url,
      },
      el('img', {
        class: 'favicon',
        src: faviconUrl(tab.url, 32),
        alt: '',
        draggable: 'false', // drag the card, not its icon
        width: 24,
        height: 24,
        loading: 'lazy',
        decoding: 'async',
      }),
      el(
        'span',
        { class: 'card-text' },
        el('span', { class: 'card-title' }, ...highlighted(title, words)),
        el(
          'span',
          { class: 'card-host' },
          // While searching, the group a result is in isn't visible otherwise.
          words.length > 0 &&
            group &&
            el(
              'span',
              {
                class: 'card-group',
                style: `--group-color: ${groupColorValues[group.color]}`,
              },
              el('span', { class: 'dot' }),
              group.title || 'Tab group',
            ),
          details.join(' · '),
        ),
      ),
    ),
    el(
      'button',
      {
        class: 'close',
        type: 'button',
        'aria-label': `Close ${title}`,
        title: 'Close tab',
      },
      '×',
    ),
  )
}

/** The text with the searched words marked. */
function highlighted(text: string, words: readonly string[]): Node[] {
  const nodes: Node[] = []
  let at = 0
  for (const [start, end] of matchRanges(text, words)) {
    nodes.push(
      document.createTextNode(text.slice(at, start)),
      el('mark', {}, text.slice(start, end)),
    )
    at = end
  }
  nodes.push(document.createTextNode(text.slice(at)))
  return nodes
}

function select(index: number): void {
  if (results.length === 0) return
  selected = (index + results.length) % results.length
  const cards = resultsElement.children
  for (let i = 0; i < cards.length; i++)
    cards[i].classList.toggle('selected', i === selected)
  cards[selected]?.scrollIntoView({ block: 'nearest' })
}

async function groupsOf(
  list: readonly TabInfo[],
): Promise<Map<number, GroupInfo>> {
  const ids = [...new Set(list.map((t) => t.groupId))].filter((id) => id >= 0)
  const found = new Map<number, GroupInfo>()
  for (const id of ids) {
    const group = await browser.getGroup(id)
    if (group) found.set(id, group)
  }
  return found
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

/**
 * Switches to a tab, like clicking it in the tab bar. A tab gets a new id
 * when it's suspended; if that happened since the page was drawn, the tabs
 * are read again and the tab at the same place in its window is opened.
 */
async function openTab(
  tabId: number,
  windowId: number,
  index: number,
): Promise<void> {
  try {
    await browser.activate(tabId)
  } catch {
    await refresh()
    const moved = tabs.find((t) => t.windowId === windowId && t.index === index)
    if (!moved) return
    await browser.activate(moved.id)
  }
  await browser.focusWindow(windowId)
}

/**
 * Closes a tab, like its × in the tab bar. The card goes at once; the page
 * redraws when the browser reports the tab closed. If the tab got a new id
 * (it was suspended), the tab at the same place with the same address is
 * closed instead, and nothing if there's none: never a different tab.
 */
async function closeTab(card: HTMLElement): Promise<void> {
  const { tab, window: windowId, index, url } = card.dataset
  card.remove()
  tabs = tabs.filter((t) => t.id !== Number(tab))
  showSearch() // keeps the search results and their selection in step
  try {
    await send('close-tab', { tabId: Number(tab) })
  } catch {
    await refresh()
    const moved = tabs.find(
      (t) =>
        t.windowId === Number(windowId) &&
        t.index === Number(index) &&
        t.url === url,
    )
    if (moved) await send('close-tab', { tabId: moved.id })
  }
}

document.addEventListener('click', (event) => {
  const target = event.target as Element
  const card = target.closest<HTMLElement>('.card')
  if (!card) return
  if (target.closest('.close')) void closeTab(card)
  else if (target.closest('.card-open'))
    void openTab(
      Number(card.dataset.tab),
      Number(card.dataset.window),
      Number(card.dataset.index),
    )
})

// Arranging cards by hand. The card moves while it's dragged, so you see
// where it lands; it can only move among the cards of its own section, so a
// group's tabs stay in their group. The tab bar itself doesn't change.
let dragged: HTMLElement | null = null

/** Saves the order of the cards in one section, then redraws. */
async function saveOrder(grid: Element): Promise<void> {
  const tabIds = [...grid.children].map((c) =>
    Number((c as HTMLElement).dataset.tab),
  )
  await send('arrange-cards', { tabIds })
  await refresh()
}

windowsElement.addEventListener('dragstart', (event) => {
  dragged = (event.target as Element).closest<HTMLElement>('.card')
  if (!dragged || !event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  dragged.classList.add('dragging')
})

windowsElement.addEventListener('dragover', (event) => {
  const grid = dragged?.parentElement
  const target = event.target as Element
  if (!dragged || !grid || target.closest('.cards') !== grid) return
  event.preventDefault() // allows the drop here
  const over = target.closest<HTMLElement>('.card')
  if (!over || over === dragged) return
  const box = over.getBoundingClientRect()
  if (event.clientX > box.left + box.width / 2) over.after(dragged)
  else over.before(dragged)
})

windowsElement.addEventListener('drop', (event) => event.preventDefault())

// Saved when the drag ends, not on drop: the drop event doesn't always
// arrive, but the drag always ends, saying whether the drop was accepted.
windowsElement.addEventListener('dragend', (event) => {
  const grid = dragged?.parentElement
  dragged?.classList.remove('dragging')
  dragged = null
  // Dropped outside its section: put everything back.
  if (event.dataTransfer?.dropEffect === 'none' || !grid) void refresh()
  else void saveOrder(grid)
})

// The same with the keyboard: Alt+Left or Alt+Right on a card.
windowsElement.addEventListener('keydown', (event) => {
  if (
    !event.altKey ||
    (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
  )
    return
  const card = (event.target as Element).closest<HTMLElement>('.card')
  const next =
    event.key === 'ArrowLeft'
      ? card?.previousElementSibling
      : card?.nextElementSibling
  if (!card?.parentElement || !next) return
  event.preventDefault() // Alt+Left would otherwise go back in history
  if (event.key === 'ArrowLeft') next.before(card)
  else next.after(card)
  card.querySelector<HTMLElement>('.card-open')?.focus()
  void saveOrder(card.parentElement).then(() =>
    document
      .querySelector<HTMLElement>(
        `.card[data-tab="${card.dataset.tab}"] .card-open`,
      )
      ?.focus(),
  )
})

resetOrder.addEventListener('click', async () => {
  await send('reset-card-order', {})
  await refresh()
})

search.addEventListener('input', () => {
  selected = 0
  showSearch()
})

search.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault() // keep the cursor in place
    select(selected + (event.key === 'ArrowDown' ? 1 : -1))
  } else if (event.key === 'Enter') {
    const tab = results[selected]
    if (tab) void openTab(tab.id, tab.windowId, tab.index)
  } else if (event.key === 'Escape' && search.value) {
    event.preventDefault()
    search.value = ''
    showSearch()
  }
})

// Typing anywhere on the page goes into the search box.
document.addEventListener('keydown', (event) => {
  const typing =
    event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
  if (typing && document.activeElement !== search) search.focus()
})

// Coming back to this tab: ready to type a new search.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  search.focus()
  search.select()
})

// Tabs change in bursts (a window of tabs suspending at once): wait for a
// quiet moment, then read them once.
let timer: ReturnType<typeof setTimeout> | undefined
function scheduleRefresh(): void {
  clearTimeout(timer)
  // Redrawing would drop the card being dragged: wait until it's let go.
  timer = setTimeout(() => (dragged ? scheduleRefresh() : void refresh()), 150)
}

for (const event of [
  chrome.tabs.onCreated,
  chrome.tabs.onRemoved,
  chrome.tabs.onMoved,
  chrome.tabs.onAttached,
  chrome.tabs.onDetached,
  chrome.tabs.onReplaced,
  chrome.tabs.onActivated,
  chrome.tabGroups.onUpdated,
] as chrome.events.Event<() => void>[]) {
  event.addListener(scheduleRefresh)
}
chrome.tabs.onUpdated.addListener((_id, change) => {
  // Only what the cards show; loading progress and the like are ignored.
  if (
    change.title ||
    change.url ||
    change.discarded !== undefined ||
    change.audible !== undefined ||
    change.pinned !== undefined ||
    change.groupId !== undefined
  )
    scheduleRefresh()
})

ownTabId = (await chrome.tabs.getCurrent())?.id
await refresh()
search.focus()
