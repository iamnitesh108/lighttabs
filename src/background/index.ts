// The service worker: builds the services with their real dependencies and
// connects them to browser events. Listeners are registered synchronously
// at the top level, as Manifest V3 requires: the browser starts this worker
// on demand, and only listeners registered right away receive the event.

import { placeholderPath } from '../core/placeholder.ts'
import { countTabs } from '../core/sessions.ts'
import { isSuspended } from '../core/tab.ts'
import { ActivityStore } from '../platform/activity-store.ts'
import { ChromeBrowser } from '../platform/browser.ts'
import { SessionStore } from '../platform/session-store.ts'
import { SettingsStore } from '../platform/settings-store.ts'
import type { Message } from '../shared/messages.ts'
import { ActivityTracker } from './activity-tracker.ts'
import { Pages } from './pages.ts'
import type { Handlers } from './router.ts'
import { route } from './router.ts'
import { Suspender } from './suspender.ts'
import { TabSaver } from './tab-saver.ts'

const timerAlarm = 'suspend-timer'
const now = () => Date.now()

const browser = new ChromeBrowser(chrome.runtime.getURL(placeholderPath))
const settings = new SettingsStore()
const sessions = new SessionStore()
const activity = new ActivityTracker(new ActivityStore(), now)
const pages = new Pages(browser, chrome.runtime.getURL(''))
const suspender = new Suspender({
  browser,
  activity,
  settings,
  pages,
  now,
  isOnline: () => navigator.onLine,
})
const saver = new TabSaver({
  browser,
  sessions,
  settings,
  pages,
  now,
  makeId: () => crypto.randomUUID(),
})

const handlers: Handlers = {
  'tab-status': ({ tabId }) => suspender.status(tabId),
  stats: async () => {
    const [tabs, lists] = await Promise.all([
      browser.queryTabs(),
      sessions.list(),
    ])
    return {
      tabs: tabs.length,
      suspended: tabs.filter(isSuspended).length,
      lists: lists.length,
      savedTabs: countTabs(lists),
    }
  },
  'suspend-tab': async ({ tabId }) => (await suspender.suspendTab(tabId), null),
  'suspend-others': async ({ windowId }) => ({
    suspended: await suspender.suspendOthers(windowId),
  }),
  'unsuspend-tab': async ({ tabId }) => (
    await suspender.unsuspendTab(tabId),
    null
  ),
  // Replies once the loading has started: it can take a while, and the
  // popup that asked may be closed by then.
  'unsuspend-all': async ({ windowId }) => {
    const { count } = await suspender.unsuspendAll(windowId)
    return { count }
  },
  'toggle-site': async ({ tabId }) => ({
    excluded: await suspender.toggleSite(tabId),
  }),
  'toggle-pause': async ({ tabId }) => ({
    paused: await activity.togglePause(tabId),
  }),
  'save-tab': async ({ tabId }) => ({ saved: await saver.saveTab(tabId) }),
  'save-window': async ({ windowId }) => ({
    saved: await saver.saveWindow(windowId),
  }),
  'save-all-windows': async ({ windowId }) => ({
    saved: await saver.saveAllWindows(windowId),
  }),
  'open-saved': async ({ windowId }) => (await pages.showSaved(windowId), null),
  'restore-session': async ({ sessionId, windowId, newWindow }) => (
    await saver.restoreSession(sessionId, windowId, newWindow),
    null
  ),
  'restore-tab': async ({ sessionId, tabId, windowId }) => (
    await saver.restoreTab(sessionId, tabId, windowId),
    null
  ),
  'remove-tab': async ({ sessionId, tabId }) => (
    await saver.removeTab(sessionId, tabId),
    null
  ),
  'delete-session': async ({ sessionId }) => (
    await saver.deleteSession(sessionId),
    null
  ),
  'rename-session': async ({ sessionId, name }) => (
    await saver.renameSession(sessionId, name),
    null
  ),
  'lock-session': async ({ sessionId, locked }) => (
    await saver.lockSession(sessionId, locked),
    null
  ),
  import: ({ text }) => saver.import(text),
  'update-settings': ({ patch }) => settings.update(patch),
}

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    // Only this extension's own pages may send commands.
    if (sender.id !== chrome.runtime.id) return false
    route(handlers, message).then(sendResponse)
    return true // the reply is sent asynchronously
  },
)

chrome.runtime.onInstalled.addListener(async () => {
  await activity.reset(await browser.queryTabs())
  await ensureTimer()
})

chrome.runtime.onStartup.addListener(async () => {
  await activity.reset(await browser.queryTabs())
  await ensureTimer()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === timerAlarm) void suspender.runTimer()
})

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const left = await activity.tabActivated(tabId, windowId)
  if (left !== undefined) await suspender.settle(left)
})
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'complete') void activity.tabNavigated(tabId)
  if (change.favIconUrl) void suspender.settle(tabId)
})
chrome.tabs.onRemoved.addListener((tabId) => void activity.tabClosed(tabId))
chrome.tabs.onReplaced.addListener(
  (added, removed) => void activity.tabReplaced(added, removed),
)

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return
  try {
    if (command === 'suspend-tab') await suspender.toggleTab(tab.id)
    else if (command === 'suspend-others')
      await suspender.suspendOthers(tab.windowId)
    else if (command === 'save-window') await saver.saveWindow(tab.windowId)
    else if (command === 'open-saved') await pages.showSaved(tab.windowId)
  } catch (error) {
    // Shortcuts have no page to show a message in; the action simply doesn't happen.
    console.warn('LightTabs shortcut', command, error)
  }
})

// Without this listener the browser would update the extension right away,
// closing suspended-tab pages that are on screen. With it, the update waits
// for the next browser restart unless no such page is open.
chrome.runtime.onUpdateAvailable.addListener(async () => {
  if (await suspender.prepareForUpdate()) chrome.runtime.reload()
})

/** The timer checks once a minute (the shortest period alarms allow). */
async function ensureTimer(): Promise<void> {
  if (!(await chrome.alarms.get(timerAlarm))) {
    await chrome.alarms.create(timerAlarm, { periodInMinutes: 1 })
  }
}

// The worker can start for any event (not only install or startup): make
// sure the timer exists in every case.
void ensureTimer()
