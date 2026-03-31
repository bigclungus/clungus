/**
 * Inject endpoint (port 9876).
 *
 * Allows Temporal workflows and scripts to send synthetic MCP notifications
 * to Claude without going through the Discord bot API (bots can't read their
 * own messages).
 *
 * POST /inject with x-inject-secret header and JSON body:
 * { content: string, chat_id: string, user?: string, message_id?: string }
 */

import type { NotificationEmitter } from './notifications.js'

const INJECT_PORT = 9876

export function startInjectEndpoint(emitter: NotificationEmitter): void {
  const INJECT_SECRET = process.env.DISCORD_INJECT_SECRET ?? ''

  if (!INJECT_SECRET) {
    console.warn('[warn] DISCORD_INJECT_SECRET is not set — inject endpoint is unauthenticated')
  }

  Bun.serve({
    port: INJECT_PORT,
    hostname: '127.0.0.1',
    reusePort: true,
    async fetch(req: Request) {
      if (req.method !== 'POST' || new URL(req.url).pathname !== '/inject') {
        return new Response('not found', { status: 404 })
      }
      const auth = req.headers.get('x-inject-secret') ?? ''
      if (INJECT_SECRET && auth !== INJECT_SECRET) {
        return new Response('unauthorized', { status: 401 })
      }
      let body: { content: string; chat_id: string; user?: string; message_id?: string }
      try {
        body = await req.json()
      } catch {
        return new Response('bad json', { status: 400 })
      }
      if (!body.content || !body.chat_id) {
        return new Response('content and chat_id required', { status: 400 })
      }
      const ts = new Date().toISOString()
      const msgId = body.message_id ?? `synth-${Date.now()}`
      emitter.emit('notifications/claude/channel', {
        content: body.content,
        meta: {
          chat_id: body.chat_id,
          message_id: msgId,
          user: body.user ?? 'temporal-sweeper',
          user_id: 'synthetic',
          ts,
        },
      }).catch((err: Error) => {
        process.stderr.write(`discord channel: inject delivery failed: ${err}\n`)
      })
      return new Response('ok', { status: 200 })
    },
  })
  process.stderr.write(`discord channel: inject endpoint on 127.0.0.1:${INJECT_PORT}\n`)
}
