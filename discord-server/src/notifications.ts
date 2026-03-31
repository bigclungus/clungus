/**
 * Inbound message → MCP notification formatting + message queue.
 *
 * When the MCP transport is connected, notifications are delivered immediately.
 * When disconnected, messages are queued (bounded: 50 messages, 5min TTL) and
 * flushed when a new connection arrives.
 */

import {
  ChannelType,
  type Client,
  type Message,
} from 'discord.js'
import type { Access } from './access.js'
import {
  gate,
  loadAccess,
  markThreadSeen,
  safeAttName,
  PERMISSION_REPLY_RE,
} from './access.js'

// ── Queue types ──────────────────────────────────────────────────────────────

interface QueuedNotification {
  method: string
  params: Record<string, unknown>
  enqueuedAt: number
}

const QUEUE_MAX_SIZE = 50
const QUEUE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ── Notification emitter ─────────────────────────────────────────────────────

export interface NotificationSink {
  notification(msg: { method: string; params: Record<string, unknown> }): Promise<void>
}

export class NotificationEmitter {
  private queue: QueuedNotification[] = []
  private sink: NotificationSink | null = null
  private _sseStreamCounter: (() => number) | null = null

  /**
   * Set a function that returns the current active SSE stream count.
   * Used to detect when notifications are sent into the void.
   */
  setSSEStreamCounter(counter: () => number): void {
    this._sseStreamCounter = counter
  }

  /**
   * Set the active MCP server as the notification sink.
   * Flushes any queued messages immediately.
   */
  setSink(sink: NotificationSink): void {
    this.sink = sink
    this.flush()
  }

  /**
   * Clear the sink (e.g. on disconnect). Future notifications will be queued.
   */
  clearSink(): void {
    this.sink = null
  }

  /**
   * Emit a notification. If a sink is connected, deliver immediately.
   * Otherwise, queue it (bounded, with TTL pruning).
   */
  async emit(method: string, params: Record<string, unknown>): Promise<void> {
    if (this.sink) {
      try {
        const streamCount = this._sseStreamCounter?.() ?? -1
        process.stderr.write(`discord-server: emitting notification via sink (method=${method}, sseStreams=${streamCount})\n`)
        await this.sink.notification({ method, params })
        if (streamCount === 0) {
          process.stderr.write(`discord-server: WARNING — notification accepted by sink but 0 SSE streams active; queuing for delivery on reconnect\n`)
          // Fall through to queue as backup
        } else {
          process.stderr.write(`discord-server: notification delivered (${streamCount} SSE stream(s) active)\n`)
          return
        }
      } catch (err) {
        process.stderr.write(`discord-server: notification send failed (sink error): ${err}\n`)
        // Fall through to queue
      }
    } else {
      process.stderr.write(`discord-server: no sink — queueing notification\n`)
    }

    // Prune expired entries
    const now = Date.now()
    this.queue = this.queue.filter(q => (now - q.enqueuedAt) < QUEUE_TTL_MS)

    // Drop oldest if at capacity
    if (this.queue.length >= QUEUE_MAX_SIZE) {
      this.queue.shift()
    }

    this.queue.push({ method, params, enqueuedAt: now })
  }

  /**
   * Flush all queued notifications to the current sink.
   */
  private flush(): void {
    if (!this.sink) return
    const now = Date.now()
    const valid = this.queue.filter(q => (now - q.enqueuedAt) < QUEUE_TTL_MS)
    this.queue = []

    for (const item of valid) {
      this.sink.notification({ method: item.method, params: item.params }).catch(err => {
        process.stderr.write(`discord-server: failed to flush queued notification: ${err}\n`)
      })
    }
  }

  /** Current queue depth (for diagnostics). */
  get queueSize(): number {
    return this.queue.length
  }
}

// ── Inbound message handling ─────────────────────────────────────────────────

/**
 * Process an inbound Discord message through the gate and emit as an
 * MCP notification if allowed. Also handles pairing and permission replies.
 */
export async function handleInbound(
  msg: Message,
  client: Client,
  emitter: NotificationEmitter,
): Promise<void> {
  const result = await gate(msg, client)

  if (result.action === 'drop') return

  if (result.action === 'pair') {
    const lead = result.isResend ? 'Still pending' : 'Pairing required'
    try {
      await msg.reply(
        `${lead} — run in Claude Code:\n\n/discord:access pair ${result.code}`,
      )
    } catch (err) {
      process.stderr.write(`discord channel: failed to send pairing code: ${err}\n`)
    }
    return
  }

  const chat_id = msg.channelId

  // Permission-reply intercept
  const permMatch = PERMISSION_REPLY_RE.exec(msg.content)
  if (permMatch) {
    void emitter.emit('notifications/claude/channel/permission', {
      request_id: permMatch[2]!.toLowerCase(),
      behavior: permMatch[1]!.toLowerCase().startsWith('y') ? 'allow' : 'deny',
    })
    const emoji = permMatch[1]!.toLowerCase().startsWith('y') ? '✅' : '❌'
    void msg.react(emoji).catch(() => {})
    return
  }

  // Typing indicator
  if (process.env.DISCORD_TYPING_INDICATORS !== 'false' && 'sendTyping' in msg.channel) {
    void msg.channel.sendTyping().catch(() => {})
  }

  // Ack reaction
  const access = result.access
  if (access.ackReaction) {
    void msg.react(access.ackReaction).catch(() => {})
  }

  // Attachment listing
  const atts: string[] = []
  for (const att of msg.attachments.values()) {
    const kb = (att.size / 1024).toFixed(0)
    atts.push(`${safeAttName(att)} (${att.contentType ?? 'unknown'}, ${kb}KB)`)
  }

  const baseContent = msg.content || (atts.length > 0 ? '(attachment)' : '')

  // --- Context enrichment ---
  const contextParts: string[] = []

  // 1. Reply context
  const refId = msg.reference?.messageId
  if (refId) {
    try {
      const refMsg = await msg.channel.messages.fetch(refId)
      if (refMsg.author.id !== client.user?.id) {
        const refText = refMsg.content.slice(0, 300) + (refMsg.content.length > 300 ? '...' : '')
        const refAuthor = refMsg.author.username
        const refTs = refMsg.createdAt.toISOString()
        contextParts.push(`<referenced_message author="${refAuthor}" ts="${refTs}">${refText}</referenced_message>`)
      }
    } catch {
      // Deleted message or missing perms
    }
  }

  // 2. Thread context (cold thread injection)
  const chType = msg.channel.type
  if (chType === ChannelType.PublicThread || chType === ChannelType.PrivateThread) {
    const isCold = markThreadSeen(chat_id)

    if (isCold) {
      try {
        const history = await msg.channel.messages.fetch({ limit: 5 })
        const botId = client.user?.id
        const sorted = [...history.values()]
          .filter(m => m.id !== msg.id && m.author.id !== botId)
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .slice(-3)

        if (sorted.length > 0) {
          const lines = sorted.map(m => {
            const text = m.content.slice(0, 200) + (m.content.length > 200 ? '...' : '')
            return `  <msg author="${m.author.username}" ts="${m.createdAt.toISOString()}">${text}</msg>`
          })
          contextParts.push(`<thread_context>\n${lines.join('\n')}\n</thread_context>`)
        }
      } catch {
        // Missing perms or fetch error
      }
    }
  }

  const content = contextParts.length > 0
    ? `${baseContent}\n${contextParts.join('\n')}`
    : baseContent

  const isDM = msg.channel.type === ChannelType.DM

  emitter.emit('notifications/claude/channel', {
    content,
    meta: {
      chat_id,
      message_id: msg.id,
      user: msg.author.username,
      user_id: msg.author.id,
      ts: msg.createdAt.toISOString(),
      ...(isDM ? { is_dm: 'true' } : {}),
      ...(atts.length > 0 ? { attachment_count: String(atts.length), attachments: atts.join('; ') } : {}),
    },
  }).catch(err => {
    process.stderr.write(`discord channel: failed to deliver inbound to Claude: ${err}\n`)
  })
}

// ── Event-based notifications (reactions, deletes, edits) ────────────────────

export function emitReaction(
  emitter: NotificationEmitter,
  channelId: string,
  messageId: string,
  reactorName: string,
  reactorId: string,
  emoji: string,
  msgAuthor: string,
  msgContent: string,
  msgTs: string,
  isThread: boolean,
  attachmentParts: string[],
): void {
  let msgBlock: string
  if (msgContent && attachmentParts.length > 0) {
    msgBlock = `${msgContent}\n${attachmentParts.join('\n')}`
  } else if (msgContent) {
    msgBlock = msgContent
  } else if (attachmentParts.length > 0) {
    msgBlock = attachmentParts.join('\n')
  } else {
    msgBlock = '(no text content)'
  }

  const content =
    `[reaction] ${reactorName} reacted ${emoji} to a message by ${msgAuthor} (id:${messageId}, ts:${msgTs}):\n${msgBlock}`

  emitter.emit('notifications/claude/channel', {
    content,
    meta: {
      chat_id: channelId,
      message_id: messageId,
      reacted_message_id: messageId,
      user: reactorName,
      user_id: reactorId,
      is_thread: isThread,
      ts: new Date().toISOString(),
    },
  }).catch(err => {
    process.stderr.write(`discord channel: failed to deliver reaction to Claude: ${err}\n`)
  })
}

export function emitDelete(
  emitter: NotificationEmitter,
  channelId: string,
  messageId: string,
  authorName: string,
  msgContent: string | null,
  channelName: string | null,
  isThread: boolean,
): void {
  let content: string
  if (msgContent) {
    content = `[deleted] ${authorName} deleted a message in #${channelName || channelId}: "${msgContent}"`
  } else {
    content = `[deleted] a message was deleted (id: ${messageId}) — content unavailable`
  }

  emitter.emit('notifications/claude/channel', {
    content,
    meta: {
      chat_id: channelId,
      message_id: messageId,
      user: authorName,
      is_thread: isThread,
      type: 'deleted',
      ts: new Date().toISOString(),
    },
  }).catch(err => {
    process.stderr.write(`discord channel: failed to deliver delete event to Claude: ${err}\n`)
  })
}

export function emitEdit(
  emitter: NotificationEmitter,
  channelId: string,
  messageId: string,
  authorName: string,
  oldContent: string | null,
  newContent: string,
  isThread: boolean,
  editedAt: string,
): void {
  let content: string
  if (oldContent) {
    content = `[edited] ${authorName} edited a message: "${oldContent}" \u2192 "${newContent}"`
  } else {
    content = `[edited] ${authorName} edited a message (old content unavailable): "${newContent}"`
  }

  emitter.emit('notifications/claude/channel', {
    content,
    meta: {
      chat_id: channelId,
      message_id: messageId,
      user: authorName,
      is_thread: isThread,
      type: 'edited',
      ts: editedAt,
    },
  }).catch(err => {
    process.stderr.write(`discord channel: failed to deliver edit event to Claude: ${err}\n`)
  })
}
