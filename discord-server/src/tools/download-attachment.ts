import type { ToolDefinition, ToolHandler } from '../types.js'

export const definition: ToolDefinition = {
  name: 'download_attachment',
  description: 'Download attachments from a specific Discord message to the local inbox. Use after fetch_messages shows a message has attachments (marked with +Natt). Returns file paths ready to Read.',
  inputSchema: {
    type: 'object',
    properties: {
      chat_id: { type: 'string' },
      message_id: { type: 'string' },
    },
    required: ['chat_id', 'message_id'],
  },
}

export const handler: ToolHandler = async (args, context) => {
  const ch = await context.access.fetchAllowedChannel(context.client, args.chat_id as string)
  const msg = await ch.messages.fetch(args.message_id as string)
  if (msg.attachments.size === 0) {
    return { content: [{ type: 'text', text: 'message has no attachments' }] }
  }
  const lines: string[] = []
  for (const att of msg.attachments.values()) {
    const path = await context.access.downloadAttachment(att)
    const kb = (att.size / 1024).toFixed(0)
    lines.push(`  ${path}  (${context.access.safeAttName(att)}, ${att.contentType ?? 'unknown'}, ${kb}KB)`)
  }
  return {
    content: [{ type: 'text', text: `downloaded ${lines.length} attachment(s):\n${lines.join('\n')}` }],
  }
}
