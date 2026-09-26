import { formatSavedAt, plural } from '../../core/format.ts'
import type { SavedGroup, SavedSession, SavedTab } from '../../core/sessions.ts'
import {
  countTabs,
  searchSessions,
  sortSessions,
  tabsWithGroups,
} from '../../core/sessions.ts'
import { exportBackup, exportText } from '../../core/transfer.ts'
import { SessionStore } from '../../platform/session-store.ts'
import { send } from '../../shared/messages.ts'
import { byId, el } from '../shared/dom.ts'
import { faviconUrl } from '../shared/favicon.ts'
import { groupColorValues } from '../shared/group-color.ts'

const store = new SessionStore()
const listsElement = byId('lists')
const message = byId('message')
const search = byId<HTMLInputElement>('search')

let sessions: SavedSession[] = []
let windowId: number = chrome.windows.WINDOW_ID_CURRENT
/** While a list is being renamed, live updates wait, so the input isn't replaced. */
let editing = false

async function load(): Promise<void> {
  sessions = sortSessions(await store.list())
  if (!editing) render()
}

function render(): void {
  const total = countTabs(sessions)
  byId('summary').textContent =
    sessions.length === 0
      ? ''
      : `${plural(total, 'tab')} in ${plural(sessions.length, 'list')}`
  byId('empty').hidden = sessions.length > 0
  byId('export').toggleAttribute('disabled', sessions.length === 0)

  const shown = searchSessions(sessions, search.value)
  const fragment = document.createDocumentFragment()
  const now = Date.now()
  for (const session of shown) fragment.append(renderSession(session, now))
  if (sessions.length > 0 && shown.length === 0) {
    fragment.append(
      el('p', { class: 'muted' }, 'No saved tabs match your search.'),
    )
  }
  listsElement.replaceChildren(fragment)
}

function renderSession(session: SavedSession, now: number): HTMLElement {
  const savedAt = formatSavedAt(session.createdAt, now)
  const details = [
    plural(session.tabs.length, 'tab'),
    session.name ? savedAt : '',
    session.locked ? 'Locked' : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return el(
    'section',
    {
      class: 'list',
      'data-session': session.id,
      'aria-label': session.name || savedAt,
    },
    el(
      'div',
      { class: 'list-header' },
      el(
        'div',
        {},
        el('h2', { class: 'list-name' }, session.name || savedAt),
        el('p', { class: 'muted' }, details),
      ),
      el(
        'div',
        { class: 'list-actions' },
        button('restore', 'Restore all'),
        button('restore-window', 'Open in new window'),
        button('rename', 'Rename'),
        button('lock', session.locked ? 'Unlock' : 'Lock'),
        session.locked
          ? null
          : button('delete', 'Delete', { class: 'link-button danger' }),
      ),
    ),
    el('ul', { class: 'tabs' }, ...renderTabs(session)),
  )
}

/** The tabs, with a label above each run of tabs from one tab group. */
function renderTabs(session: SavedSession): HTMLElement[] {
  const items: HTMLElement[] = []
  let currentGroup: string | undefined
  for (const { tab, group } of tabsWithGroups(session)) {
    if (group && group.id !== currentGroup) items.push(renderGroupLabel(group))
    currentGroup = group?.id
    items.push(renderTab(tab, session.locked, group))
  }
  return items
}

function renderGroupLabel(group: SavedGroup): HTMLElement {
  return el(
    'li',
    { class: 'group-label' },
    el('span', {
      class: 'dot',
      style: `background: ${groupColorValues[group.color]}`,
    }),
    group.title || 'Tab group',
  )
}

/** A small text button in a list header; clicks are handled by the delegated listener. */
function button(
  action: string,
  label: string,
  extra: Record<string, string | boolean> = {},
): HTMLButtonElement {
  return el(
    'button',
    { class: 'link-button', type: 'button', 'data-action': action, ...extra },
    label,
  )
}

/** A saved tab; tabs from a tab group get a bar in the group's colour. */
function renderTab(
  tab: SavedTab,
  locked: boolean,
  group?: SavedGroup,
): HTMLElement {
  let host = ''
  try {
    host = new URL(tab.url).host
  } catch {
    // Unusual addresses simply show no host.
  }
  return el(
    'li',
    {
      class: group ? 'tab in-group' : 'tab',
      'data-tab': tab.id,
      style: group && `--group-color: ${groupColorValues[group.color]}`,
    },
    el(
      'a',
      {
        class: 'tab-link',
        href: tab.url,
        'data-action': 'open',
        title: tab.url,
      },
      el('img', {
        class: 'favicon',
        src: faviconUrl(tab.url),
        alt: '',
        loading: 'lazy',
        width: 16,
        height: 16,
      }),
      el('span', { class: 'tab-title' }, tab.title),
    ),
    el('span', { class: 'tab-host' }, host),
    locked
      ? null
      : el(
          'button',
          {
            class: 'remove',
            type: 'button',
            'data-action': 'remove',
            'aria-label': `Remove ${tab.title}`,
          },
          '×',
        ),
  )
}

// One listener for every list, so thousands of tabs don't need thousands of handlers.
listsElement.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    '[data-action]',
  )
  const sessionId =
    target?.closest<HTMLElement>('[data-session]')?.dataset.session
  if (!target || !sessionId) return
  const tabId = target.closest<HTMLElement>('[data-tab]')?.dataset.tab ?? ''
  const session = sessions.find((s) => s.id === sessionId)

  switch (target.dataset.action) {
    case 'open': {
      // Ctrl/Cmd/Shift-click or a middle click open the link normally and
      // keep it in the list; a plain click restores it.
      const mouse = event as MouseEvent
      if (
        mouse.ctrlKey ||
        mouse.metaKey ||
        mouse.shiftKey ||
        mouse.button !== 0
      )
        return
      event.preventDefault()
      void act(() => send('restore-tab', { sessionId, tabId, windowId }))
      break
    }
    case 'remove':
      void act(() => send('remove-tab', { sessionId, tabId }))
      break
    case 'restore':
      void act(() =>
        send('restore-session', { sessionId, windowId, newWindow: false }),
      )
      break
    case 'restore-window':
      void act(() =>
        send('restore-session', { sessionId, windowId, newWindow: true }),
      )
      break
    case 'lock':
      void act(() =>
        send('lock-session', { sessionId, locked: !session?.locked }),
      )
      break
    case 'delete':
      if (
        session &&
        confirm(`Delete this list of ${plural(session.tabs.length, 'tab')}?`)
      ) {
        void act(() => send('delete-session', { sessionId }))
      }
      break
    case 'rename':
      if (session) startRename(target.closest('section')!, session)
      break
  }
})

function startRename(section: HTMLElement, session: SavedSession): void {
  const heading = section.querySelector('.list-name')!
  const input = el('input', {
    class: 'name-input',
    value: session.name,
    placeholder: formatSavedAt(session.createdAt, Date.now()),
    'aria-label': 'List name',
    maxlength: 100,
  })
  editing = true
  heading.replaceWith(input)
  input.focus()
  input.select()

  let done = false
  const finish = async (save: boolean) => {
    if (done) return
    done = true
    editing = false
    if (save && input.value.trim() !== session.name) {
      await act(() =>
        send('rename-session', { sessionId: session.id, name: input.value }),
      )
    }
    render()
  }
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void finish(true)
    if (event.key === 'Escape') void finish(false)
  })
  input.addEventListener('blur', () => void finish(true))
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
search.addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(render, 120)
})

const importFile = byId<HTMLInputElement>('import-file')
byId('import').addEventListener('click', () => importFile.click())
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0]
  importFile.value = ''
  if (!file) return
  await act(async () => {
    const { lists, tabs } = await send('import', { text: await file.text() })
    say(`Imported ${plural(tabs, 'tab')} in ${plural(lists, 'list')}.`)
  })
})

const exportDialog = byId<HTMLDialogElement>('export-dialog')
byId('export').addEventListener('click', () => exportDialog.showModal())
exportDialog.addEventListener('close', () => {
  const date = new Date().toISOString().slice(0, 10)
  if (exportDialog.returnValue === 'backup') {
    download(
      `lighttabs-${date}.json`,
      exportBackup(sessions, Date.now()),
      'application/json',
    )
  } else if (exportDialog.returnValue === 'text') {
    download(`lighttabs-${date}.txt`, exportText(sessions), 'text/plain')
  }
})

function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  el('a', { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Runs an action and shows its error, if any. */
async function act(action: () => Promise<unknown>): Promise<void> {
  say('')
  try {
    await action()
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true)
  }
}

function say(text: string, isError = false): void {
  message.textContent = text
  message.classList.toggle('error', isError)
}

async function main(): Promise<void> {
  windowId = (await chrome.windows.getCurrent()).id ?? windowId
  const shortcut = (await chrome.commands.getAll()).find(
    (c) => c.name === 'save-window',
  )?.shortcut
  if (shortcut) byId('save-shortcut').textContent = shortcut
  store.onChange(() => void load())
  await load()
}

main().catch((error: unknown) =>
  say(error instanceof Error ? error.message : String(error), true),
)
