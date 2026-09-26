import type { Settings } from '../core/settings.ts'
import type { Blocker } from '../core/suspend-policy.ts'

/** What the popup shows about the current tab. */
export type TabStatus = {
  title: string
  suspended: boolean
  /** Why the timer won't suspend it (evaluated as if you left the tab now). */
  blocker: Blocker | null
  /** How long after you leave the tab it will be suspended. */
  suspendAfterMinutes: number
  site: string | null
  /** The rule excluding this tab's site, if any. */
  excludedBy: string | null
  paused: boolean
}

export type Stats = {
  tabs: number
  suspended: number
  lists: number
  savedTabs: number
}

/**
 * Every request the pages can send to the background, with its reply.
 * Adding a request here makes the compiler demand a handler for it.
 */
export type Requests = {
  'tab-status': { request: { tabId: number }; reply: TabStatus }
  stats: { request: Record<string, never>; reply: Stats }
  'suspend-tab': { request: { tabId: number }; reply: null }
  'suspend-others': {
    request: { windowId: number }
    reply: { suspended: number }
  }
  'suspend-group': {
    request: { groupId: number }
    reply: { suspended: number }
  }
  'unsuspend-tab': { request: { tabId: number }; reply: null }
  'unsuspend-all': { request: { windowId: number }; reply: { count: number } }
  'toggle-site': { request: { tabId: number }; reply: { excluded: boolean } }
  'toggle-pause': { request: { tabId: number }; reply: { paused: boolean } }
  'save-tab': { request: { tabId: number }; reply: { saved: number } }
  'save-window': { request: { windowId: number }; reply: { saved: number } }
  'save-group': {
    request: { groupId: number; windowId: number }
    reply: { saved: number }
  }
  'save-all-windows': {
    request: { windowId: number }
    reply: { saved: number }
  }
  'open-saved': { request: { windowId?: number }; reply: null }
  'restore-session': {
    request: { sessionId: string; windowId: number; newWindow: boolean }
    reply: null
  }
  'restore-tab': {
    request: { sessionId: string; tabId: string; windowId: number }
    reply: null
  }
  'remove-tab': { request: { sessionId: string; tabId: string }; reply: null }
  'delete-session': { request: { sessionId: string }; reply: null }
  'rename-session': {
    request: { sessionId: string; name: string }
    reply: null
  }
  'lock-session': {
    request: { sessionId: string; locked: boolean }
    reply: null
  }
  import: { request: { text: string }; reply: { lists: number; tabs: number } }
  'update-settings': { request: { patch: Partial<Settings> }; reply: Settings }
}

export type RequestType = keyof Requests
export type Message = {
  [K in RequestType]: { type: K } & Requests[K]['request']
}[RequestType]
export type Reply<K extends RequestType> =
  { ok: true; value: Requests[K]['reply'] } | { ok: false; error: string }

/** An error meant for the user, shown as-is (anything else becomes a generic message). */
export class UserError extends Error {}

/** Sends a request to the background and returns its reply, or throws its error. */
export async function send<K extends RequestType>(
  type: K,
  request: Requests[K]['request'],
): Promise<Requests[K]['reply']> {
  const reply = (await chrome.runtime.sendMessage({ type, ...request })) as
    Reply<K> | undefined
  if (!reply) throw new Error('LightTabs is restarting. Try again.')
  if (!reply.ok) throw new Error(reply.error)
  return reply.value
}
