import { plural } from '../../core/format.ts'
import type { RequestType } from '../../shared/messages.ts'
import { send } from '../../shared/messages.ts'
import { describeStatus } from '../shared/copy.ts'
import { byId } from '../shared/dom.ts'
import { groupColorValues } from '../shared/group-color.ts'

const message = byId('message')

async function main(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id === undefined) return
  const tabId = tab.id
  const windowId = tab.windowId
  const groupId = tab.groupId

  await Promise.all([
    showStatus(tabId),
    showStats(),
    showShortcuts(),
    showGroup(groupId),
  ])

  // Actions that close tabs (or switch away) close the popup too; the
  // result is visible in the browser itself.
  const actions: Partial<Record<RequestType, () => Promise<unknown>>> = {
    'suspend-tab': () => send('suspend-tab', { tabId }).then(close),
    'unsuspend-tab': () => send('unsuspend-tab', { tabId }).then(close),
    'suspend-others': async () => {
      const { count } = await send('suspend-others', { windowId })
      say(
        count === 0
          ? 'No other tabs to suspend.'
          : `Suspending ${plural(count, 'tab')}.`,
      )
      await showStats()
    },
    'unsuspend-all': async () => {
      const { count } = await send('unsuspend-all', { windowId })
      say(
        count === 0
          ? 'No suspended tabs in this window.'
          : `Loading ${plural(count, 'tab')}, a few at a time.`,
      )
      await showStats()
    },
    'suspend-group': async () => {
      const { count } = await send('suspend-group', { groupId })
      say(
        count === 0
          ? 'No other tabs in this group to suspend.'
          : `Suspending ${plural(count, 'tab')}.`,
      )
      await showStats()
    },
    'save-group': () => send('save-group', { groupId, windowId }).then(close),
    'save-window': () => send('save-window', { windowId }).then(close),
    'save-tab': () => send('save-tab', { tabId }).then(close),
    'save-all-windows': () =>
      send('save-all-windows', { windowId }).then(close),
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-action]',
  )) {
    // Read on click: the current tab's button switches between suspend and load.
    button.addEventListener('click', () =>
      run(button, actions[button.dataset.action as RequestType]),
    )
  }

  byId<HTMLInputElement>('toggle-site').addEventListener('change', () =>
    run(null, async () => {
      await send('toggle-site', { tabId })
      await showStatus(tabId)
    }),
  )
  byId<HTMLInputElement>('toggle-pause').addEventListener('change', () =>
    run(null, async () => {
      await send('toggle-pause', { tabId })
      await showStatus(tabId)
    }),
  )
  byId('open-saved').addEventListener('click', () =>
    run(null, () => send('open-saved', { windowId }).then(close)),
  )
  byId('open-overview').addEventListener('click', () =>
    run(null, () => send('open-overview', { windowId }).then(close)),
  )
  byId('open-options').addEventListener('click', () => {
    void chrome.runtime.openOptionsPage()
    close()
  })
}

async function showStatus(tabId: number): Promise<void> {
  const status = await send('tab-status', { tabId })
  byId('tab-title').textContent = status.title
  byId('tab-status').textContent = describeStatus(status)

  byId('toggle-tab').dataset.action = status.suspended
    ? 'unsuspend-tab'
    : 'suspend-tab'
  byId('toggle-tab-label').textContent = status.suspended
    ? 'Unsuspend this tab'
    : 'Suspend this tab'

  const site = byId<HTMLInputElement>('toggle-site')
  site.checked = status.excludedBy !== null
  site.disabled = status.site === null
  byId('toggle-site-label').textContent = status.site
    ? `Never suspend ${status.excludedBy ?? status.site}`
    : 'Never suspend this site'

  const pause = byId<HTMLInputElement>('toggle-pause')
  pause.checked = status.paused
  pause.disabled = status.blocker === 'not-a-web-page'
}

async function showStats(): Promise<void> {
  const stats = await send('stats', {})
  const saved = stats.lists === 0 ? 'nothing saved' : `${stats.savedTabs} saved`
  byId('stats').textContent =
    `${stats.suspended} of ${stats.tabs} suspended · ${saved}`
  byId('stats').title =
    `${plural(stats.suspended, 'tab')} suspended, ${plural(stats.savedTabs, 'tab')} in saved lists`
}

/** Shows the tab group actions when the current tab is in a group. */
async function showGroup(groupId: number): Promise<void> {
  if (groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return
  const group = await chrome.tabGroups.get(groupId)
  byId('tab-group').hidden = false
  if (group.title) byId('tab-group-name').textContent = group.title
  byId('tab-group-dot').style.background = groupColorValues[group.color]
}

/** Shows the keyboard shortcuts the user actually has (they can change them). */
async function showShortcuts(): Promise<void> {
  const commands = await chrome.commands.getAll()
  for (const kbd of document.querySelectorAll<HTMLElement>(
    'kbd[data-command]',
  )) {
    kbd.textContent =
      commands.find((c) => c.name === kbd.dataset.command)?.shortcut ?? ''
  }
}

/** Runs an action with its button disabled, and shows any error. */
async function run(
  button: HTMLButtonElement | null,
  action: (() => Promise<unknown>) | undefined,
): Promise<void> {
  if (!action) return
  if (button) button.disabled = true
  try {
    await action()
  } catch (error) {
    say(error instanceof Error ? error.message : String(error), true)
  } finally {
    if (button) button.disabled = false
  }
}

function say(text: string, isError = false): void {
  message.textContent = text
  message.classList.toggle('error', isError)
}

function close(): void {
  window.close()
}

main().catch((error: unknown) =>
  say(error instanceof Error ? error.message : String(error), true),
)
