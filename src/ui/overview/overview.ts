import { plural } from '../../core/format.ts'
import type { Arrangement, OverviewItem } from '../../core/overview.ts'
import {
  arrangementKey,
  isArranged,
  noArrangement,
  overviewOf,
  tabsOf,
} from '../../core/overview.ts'
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
const savedOrder = new SessionValue<Arrangement>(arrangementKey)

let tabs: TabInfo[] = []
let groups = new Map<number, GroupInfo>()
/** The tabs matching the search, best first, and the one Enter opens. */
let results: TabInfo[] = []
let selected = 0
let ownTabId: number | undefined
const ownUrl = chrome.runtime.getURL('ui/overview/overview.html')

/** Reads the tabs again and redraws. */
async function refresh(): Promise<void> {
  // Every window can have an overview; they don't list each other.
  tabs = (await browser.queryTabs()).filter(
    (t) => t.id !== ownTabId && !t.url.startsWith(ownUrl),
  )
  groups = await groupsOf(tabs)
  const order = (await savedOrder.get()) ?? noArrangement
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
    ...windows.map((window, i) =>
      el(
        'section',
        { class: 'window' },
        windows.length > 1 &&
          el(
            'h2',
            { class: 'window-title' },
            `Window ${i + 1} · ${plural(tabsOf(window.items).length, 'tab')}`,
          ),
        // One grid per window: ungrouped tabs as cards, each group a whole row.
        el('div', { class: 'cards items' }, ...window.items.map(renderItem)),
      ),
    ),
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

function renderItem(item: OverviewItem): HTMLElement {
  if (item.kind === 'tab') return movableCard(item.tab, item.key)
  const group = groups.get(item.groupId)
  return el(
    'div',
    {
      class: 'group',
      'data-key': item.key,
      style: group && `--group-color: ${groupColorValues[group.color]}`,
    },
    el(
      'h3',
      {
        class: 'group-title',
        // The whole group is moved by its title.
        draggable: 'true',
        tabindex: 0,
        title: 'Drag to move the group, or press Alt+Up or Alt+Down',
      },
      el('span', { class: 'dot' }),
      group?.title || 'Tab group',
      el('span', { class: 'muted' }, plural(item.tabs.length, 'tab')),
    ),
    el('div', { class: 'cards' }, ...item.tabs.map((tab) => movableCard(tab))),
  )
}

/** A card that can be dragged (search results keep their best-first order). */
function movableCard(tab: TabInfo, key?: string): HTMLElement {
  const card = renderCard(tab, [], false)
  card.draggable = true
  if (key) card.dataset.key = key
  return card
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

// Arranging by hand, like icons on a phone's home screen: the dragged one
// takes the place of whatever the pointer moves onto, and the rest move
// out of the way at once, so what you see is where it lands. Everything
// moves among its siblings only: an ungrouped card or a whole group (by its
// title) within its window's grid, a group's card within its group. The
// tab bar itself doesn't change.

let dragged: HTMLElement | null = null
/**
 * What the last move was made over. Moving shifts the grid under a still
 * pointer (a group is a whole row); acting on the same thing again would
 * move it back and forth.
 */
let movedOver: Element | null = null

/** What is moved from this point: a group by its title, else a card. */
function movableAt(target: Element): HTMLElement | null {
  return (
    target.closest('.group-title')?.closest<HTMLElement>('.group') ??
    target.closest<HTMLElement>('.card')
  )
}

/** The child of container that holds target, if any. */
function childHolding(container: Element, target: Element): HTMLElement | null {
  let node: Element | null = target
  while (node && node.parentElement !== container) node = node.parentElement
  return node as HTMLElement | null
}

/** Puts moved where other is now; other and the ones between shift by one. */
function takePlace(moved: HTMLElement, other: Element): void {
  const after =
    moved.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING
  if (after) other.after(moved)
  else other.before(moved)
}

const isCard = (e: Element | null): e is HTMLElement =>
  e?.classList.contains('card') ?? false

/**
 * The card right above or below one, in the same column. Only within its
 * run of cards: a group row in between ends the column.
 */
function cardInColumn(card: HTMLElement, step: -1 | 1): HTMLElement | null {
  const { left, top } = card.getBoundingClientRect()
  const next = (e: Element) =>
    step < 0 ? e.previousElementSibling : e.nextElementSibling
  for (let e = next(card); isCard(e); e = next(e)) {
    const box = e.getBoundingClientRect()
    if (Math.abs(box.left - left) < 2 && box.top !== top) return e
  }
  return null
}

/** Saves the new order of the moved one and its siblings, then redraws. */
async function saveOrder(moved: HTMLElement): Promise<void> {
  const container = moved.parentElement
  if (!container) return
  const siblings = [...container.children] as HTMLElement[]
  if (container.classList.contains('items'))
    await send('arrange-items', {
      keys: siblings.map((e) => e.dataset.key ?? ''),
    })
  else
    await send('arrange-cards', {
      tabIds: siblings.map((c) => Number(c.dataset.tab)),
    })
  await refresh()
}

windowsElement.addEventListener('dragstart', (event) => {
  dragged = movableAt(event.target as Element)
  movedOver = null
  if (!dragged || !event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  dragged.classList.add('dragging')
})

// Listened on the whole page: moving a card can shrink the grid from under
// the pointer, and a drop there must keep what's shown, not undo it.
document.addEventListener('dragover', (event) => {
  if (!dragged) return
  event.preventDefault() // allows the drop anywhere on the page
  const container = dragged.parentElement
  const target = event.target as Element
  if (!container?.contains(target)) return
  const over = childHolding(container, target)
  if (!over || over === movedOver) return
  movedOver = over
  if (over !== dragged) takePlace(dragged, over)
})

document.addEventListener('drop', (event) => {
  if (dragged) event.preventDefault()
})

// Saved when the drag ends, not on drop: the drop event doesn't always
// arrive, but the drag always ends, saying whether the drop was accepted.
windowsElement.addEventListener('dragend', (event) => {
  const moved = dragged
  dragged = null
  moved?.classList.remove('dragging')
  if (!moved) return
  // Cancelled with Escape, or dropped outside the page: put it back.
  if (event.dataTransfer?.dropEffect === 'none') void refresh()
  else void saveOrder(moved)
})

// The same with the keyboard: Alt+Left or Alt+Right moves a card one place,
// Alt+Up or Alt+Down one row (into the place of the card above or below);
// Alt+Up or Alt+Down on a group's title moves the group.
windowsElement.addEventListener('keydown', (event) => {
  const up = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
  const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
  if (
    !event.altKey ||
    (!vertical && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
  )
    return
  const moved = movableAt(event.target as Element)
  const group = moved?.classList.contains('group')
  if (!moved || (group && !vertical)) return
  event.preventDefault() // Alt+Left would otherwise go back in history
  const other =
    !group && vertical
      ? cardInColumn(moved, up ? -1 : 1)
      : up
        ? moved.previousElementSibling
        : moved.nextElementSibling
  if (!other) return
  takePlace(moved, other)
  const focus = () =>
    document
      .querySelector<HTMLElement>(
        group
          ? `.group[data-key="${moved.dataset.key}"] .group-title`
          : `.card[data-tab="${moved.dataset.tab}"] .card-open`,
      )
      ?.focus()
  focus() // moving an element drops its focus
  void saveOrder(moved).then(focus)
})

resetOrder.addEventListener('click', async () => {
  await send('reset-arrangement', {})
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
// Cards arranged in another window's overview: show the same order here.
chrome.storage.session.onChanged.addListener((changes) => {
  if (arrangementKey in changes) scheduleRefresh()
})
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
