import type { ToolDefinition, ToolHandler } from '../types.js'

export const definition: ToolDefinition = {
  name: 'edit_message',
  description: 'Edit a message the bot previously sent. Useful for interim progress updates. Edits don\'t trigger push notifications — send a new reply when a long task completes so the user\'s device pings.',
  inputSchema: {
    type: 'object',
    properties: {
      chat_id: { type: 'string' },
      message_id: { type: 'string' },
      text: { type: 'string' },
    },
    required: ['chat_id', 'message_id', 'text'],
  },
}

export const handler: ToolHandler = async (args, context) => {
  const ch = await context.access.fetchAllowedChannel(context.client, args.chat_id as string)
  const msg = await ch.messages.fetch(args.message_id as string)
  const edited = await msg.edit(args.text as string)
  return { content: [{ type: 'text', text: `edited (id: ${edited.id})` }] }
}
