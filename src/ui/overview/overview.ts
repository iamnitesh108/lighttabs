import { plural } from '../../core/format.ts'
import type { Arrangement, OverviewItem } from '../../core/overview.ts'
import {
  arrangementKey,
  dropInCell,
  isArranged,
  noArrangement,
  overviewOf,
  swapped,
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

/** Reads the tabs again and redraws. */
async function refresh(): Promise<void> {
  tabs = (await browser.queryTabs()).filter((t) => t.id !== ownTabId)
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

// Arranging by hand. Everything moves among its siblings only: an
// ungrouped card or a whole group (by its title) within its window's grid,
// a group's card within its group. A line shows where it will land, and
// it moves when let go: moving it during the drag would shift the grid under
// the pointer (a group is a whole row) and make it jump back and forth.
// The tab bar itself doesn't change.
//
// Near a card's left or right side, a card goes beside it. Near its top or
// bottom, it goes into that column: into the cell below the gap, with the
// card that was there right below it (see dropInCell).

/** Where the dragged one lands if let go now. */
type DropAt =
  | { kind: 'beside'; next: HTMLElement; after: boolean }
  | { kind: 'column'; upper: HTMLElement | null; lower: HTMLElement | null }

let dragged: HTMLElement | null = null
let dropAt: DropAt | null = null

const dropClasses = ['drop-before', 'drop-after', 'drop-above', 'drop-below']

/** Moves the line showing where the dragged one lands. */
function showDropAt(next: DropAt | null): void {
  for (const e of document.querySelectorAll(`.${dropClasses.join(', .')}`))
    e.classList.remove(...dropClasses)
  dropAt = next
  if (next?.kind === 'beside')
    next.next.classList.add(next.after ? 'drop-after' : 'drop-before')
  else if (next?.lower) next.lower.classList.add('drop-above')
  else next?.upper?.classList.add('drop-below')
}

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

/**
 * The child nearest to a point: in the gaps between cards (where you aim
 * to drop between two of them) the pointer is over none of them.
 */
function nearestChild(
  container: Element,
  x: number,
  y: number,
): HTMLElement | null {
  let nearest: HTMLElement | null = null
  let best = Infinity
  for (const child of container.children as HTMLCollectionOf<HTMLElement>) {
    const box = child.getBoundingClientRect()
    const dx = Math.max(box.left - x, 0, x - box.right)
    const dy = Math.max(box.top - y, 0, y - box.bottom)
    const distance = dx * dx + dy * dy
    if (distance < best) [nearest, best] = [child, distance]
  }
  return nearest
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

/** The run of cards a card is in: between groups, or the ends of the grid. */
function runOf(card: HTMLElement): HTMLElement[] {
  let first = card
  while (isCard(first.previousElementSibling))
    first = first.previousElementSibling
  const run = [first]
  for (
    let next = first.nextElementSibling;
    isCard(next);
    next = next.nextElementSibling
  )
    run.push(next)
  return run
}

/** How many columns a grid of cards shows now (it depends on the width). */
function columnsOf(grid: Element): number {
  return getComputedStyle(grid).gridTemplateColumns.split(' ').length
}

/**
 * Moves a card into the cell of another card of a run, or the cell below
 * it; the card in that cell goes right below (see dropInCell).
 */
function moveToCell(
  moved: HTMLElement,
  card: HTMLElement,
  rowsDown: 0 | 1,
): void {
  const grid = card.parentElement
  if (!grid) return
  const run = runOf(card)
  const columns = columnsOf(grid)
  const placed = dropInCell(
    run,
    moved,
    run.indexOf(card) + rowsDown * columns,
    columns,
  )
  // The grid's order with the run replaced, wherever moved came from.
  const stay = run.filter((c) => c !== moved)
  const order = ([...grid.children] as HTMLElement[]).filter((c) => c !== moved)
  if (stay.length === 0) return
  order.splice(order.indexOf(stay[0]), stay.length, ...placed)
  grid.append(...order)
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

/** Where a drop at this point of over would land. */
function dropPoint(
  moved: HTMLElement,
  over: HTMLElement,
  event: DragEvent,
): DropAt | null {
  const box = over.getBoundingClientRect()
  const x = (event.clientX - box.left) / box.width - 0.5
  const y = (event.clientY - box.top) / box.height - 0.5
  // A group fills its row: land above or below it.
  if (over.classList.contains('group'))
    return { kind: 'beside', next: over, after: y > 0 }
  // Closer to the left or right side than to the top or bottom: beside it.
  if (Math.abs(x) >= Math.abs(y))
    return { kind: 'beside', next: over, after: x > 0 }
  const upper = y < 0 ? cardInColumn(over, -1) : over
  const lower = y < 0 ? over : cardInColumn(over, 1)
  if (lower === moved) return null // its own cell
  return { kind: 'column', upper, lower }
}

windowsElement.addEventListener('dragstart', (event) => {
  dragged = movableAt(event.target as Element)
  if (!dragged || !event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  dragged.classList.add('dragging')
})

windowsElement.addEventListener('dragover', (event) => {
  const container = dragged?.parentElement
  const target = event.target as Element
  if (!dragged || !container?.contains(target)) return
  event.preventDefault() // allows the drop here
  const over =
    childHolding(container, target) ??
    nearestChild(container, event.clientX, event.clientY)
  const next = over && over !== dragged ? dropPoint(dragged, over, event) : null
  if (!sameDropAt(next, dropAt)) showDropAt(next)
})

function sameDropAt(a: DropAt | null, b: DropAt | null): boolean {
  if (a?.kind === 'beside' && b?.kind === 'beside')
    return a.next === b.next && a.after === b.after
  if (a?.kind === 'column' && b?.kind === 'column')
    return a.upper === b.upper && a.lower === b.lower
  return a === b
}

windowsElement.addEventListener('drop', (event) => event.preventDefault())

// Moved when the drag ends, not on drop: the drop event doesn't always
// arrive, but the drag always ends, saying whether the drop was accepted.
windowsElement.addEventListener('dragend', (event) => {
  const moved = dragged
  const at = dropAt
  dragged = null
  showDropAt(null)
  moved?.classList.remove('dragging')
  if (!moved || !at || event.dataTransfer?.dropEffect === 'none') return
  if (at.kind === 'beside') {
    if (at.after) at.next.after(moved)
    else at.next.before(moved)
  } else if (at.lower) {
    moveToCell(moved, at.lower, 0)
  } else if (at.upper) {
    moveToCell(moved, at.upper, 1) // no card below the gap: its empty cell
  }
  void saveOrder(moved)
})

// The same with the keyboard, one place at a time: Alt+Left or Alt+Right
// on a card moves it along, Alt+Up or Alt+Down swaps it with the card above
// or below; Alt+Up or Alt+Down on a group's title moves the group.
windowsElement.addEventListener('keydown', (event) => {
  const up = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
  const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
  if (
    !event.altKey ||
    (!vertical && !['ArrowLeft', 'ArrowRight'].includes(event.key))
  )
    return
  const moved = movableAt(event.target as Element)
  const group = moved?.classList.contains('group')
  if (!moved || (group && !vertical)) return
  event.preventDefault() // Alt+Left would otherwise go back in history
  if (!group && vertical) {
    const other = cardInColumn(moved, up ? -1 : 1)
    if (!other) return
    const grid = moved.parentElement
    grid?.append(...swapped([...grid.children], moved, other))
  } else {
    const next = up ? moved.previousElementSibling : moved.nextElementSibling
    if (!next) return
    if (up) next.before(moved)
    else next.after(moved)
  }
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
