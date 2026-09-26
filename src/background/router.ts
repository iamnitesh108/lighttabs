import type {
  Message,
  Reply,
  RequestType,
  Requests,
} from '../shared/messages.ts'
import { UserError } from '../shared/messages.ts'

/** One function per request type; the compiler checks every type has one. */
export type Handlers = {
  [K in RequestType]: (
    request: Requests[K]['request'],
  ) => Promise<Requests[K]['reply']>
}

/**
 * Runs the handler for a message and wraps the result as a Reply. Errors
 * meant for the user keep their message; anything unexpected is logged and
 * replaced by a generic one.
 */
export async function route(
  handlers: Handlers,
  message: Message,
): Promise<Reply<RequestType>> {
  const handler = handlers[message.type] as
    ((request: Message) => Promise<unknown>) | undefined
  if (!handler)
    return { ok: false, error: `Unknown request: ${String(message.type)}` }
  try {
    return {
      ok: true,
      value: (await handler(message)) as Requests[RequestType]['reply'],
    }
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message }
    console.error('LightTabs:', message.type, error)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}
