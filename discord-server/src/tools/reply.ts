import type { ToolDefinition, ToolHandler } from '../types.js'
import { statSync } from 'fs'

export const definition: ToolDefinition = {
  name: 'reply',
  description:
    'Reply on Discord. Pass chat_id from the inbound message. Optionally pass reply_to (message_id) for threading, and files (absolute paths) to attach images or other files.',
  inputSchema: {
    type: 'object',
    properties: {
      chat_id: { type: 'string' },
      text: { type: 'string' },
      reply_to: {
        type: 'string',
        description: 'Message ID to thread under. Use message_id from the inbound <channel> block, or an id from fetch_messages.',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Absolute file paths to attach (images, logs, etc). Max 10 files, 25MB each.',
      },
    },
    required: ['chat_id', 'text'],
  },
}

export const handler: ToolHandler = async (args, context) => {
  const chat_id = args.chat_id as string
  const text = args.text as string
  const reply_to = args.reply_to as string | undefined
  const files = (args.files as string[] | undefined) ?? []

  const ch = await context.access.fetchAllowedChannel(context.client, chat_id)
  if (!('send' in ch)) throw new Error('channel is not sendable')

  for (const f of files) {
    context.access.assertSendable(f)
    const st = statSync(f)
    if (st.size > context.access.MAX_ATTACHMENT_BYTES) {
      throw new Error(`file too large: ${f} (${(st.size / 1024 / 1024).toFixed(1)}MB, max 25MB)`)
    }
  }
  if (files.length > 10) throw new Error('Discord allows max 10 attachments per message')

  const access = context.access.loadAccess()
  const limit = Math.max(1, Math.min(access.textChunkLimit ?? context.access.MAX_CHUNK_LIMIT, context.access.MAX_CHUNK_LIMIT))
  const mode = access.chunkMode ?? 'length'
  const replyMode = access.replyToMode ?? 'first'
  const chunks = context.access.chunk(text, limit, mode)
  const sentIds: string[] = []

  try {
    for (let i = 0; i < chunks.length; i++) {
      const shouldReplyTo =
        reply_to != null &&
        replyMode !== 'off' &&
        (replyMode === 'all' || i === 0)
      const sent = await ch.send({
        content: chunks[i],
        ...(i === 0 && files.length > 0 ? { files } : {}),
        ...(shouldReplyTo
          ? { reply: { messageReference: reply_to, failIfNotExists: false } }
          : {}),
      })
      context.access.noteSent(sent.id)
      sentIds.push(sent.id)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`reply failed after ${sentIds.length} of ${chunks.length} chunk(s) sent: ${msg}`)
  }

  const result =
    sentIds.length === 1
      ? `sent (id: ${sentIds[0]})`
      : `sent ${sentIds.length} parts (ids: ${sentIds.join(', ')})`
  return { content: [{ type: 'text', text: result }] }
}
