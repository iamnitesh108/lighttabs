import { describe, expect, it, vi } from 'vitest'
import { route, type Handlers } from '../../src/background/router.ts'
import { UserError } from '../../src/shared/messages.ts'

describe('route', () => {
  const handlers = {
    'toggle-pause': async ({ tabId }: { tabId: number }) => ({
      paused: tabId === 1,
    }),
    'suspend-tab': async () => {
      throw new UserError("It's the only tab in this window.")
    },
    'delete-session': async () => {
      throw new Error('storage exploded: /secret/path')
    },
  } as unknown as Handlers

  it("returns the handler's value", async () => {
    expect(await route(handlers, { type: 'toggle-pause', tabId: 1 })).toEqual({
      ok: true,
      value: { paused: true },
    })
  })

  it('passes user errors through, and hides unexpected ones', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await route(handlers, { type: 'suspend-tab', tabId: 1 })).toEqual({
      ok: false,
      error: "It's the only tab in this window.",
    })
    const hidden = await route(handlers, {
      type: 'delete-session',
      sessionId: 'x',
    })
    expect(hidden).toEqual({
      ok: false,
      error: 'Something went wrong. Please try again.',
    })
    expect(log).toHaveBeenCalled()
  })
})
