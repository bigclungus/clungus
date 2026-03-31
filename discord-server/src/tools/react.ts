import type { ToolDefinition, ToolHandler } from '../types.js'

export const definition: ToolDefinition = {
  name: 'react',
  description: 'Add an emoji reaction to a Discord message. Unicode emoji work directly; custom emoji need the <:name:id> form.',
  inputSchema: {
    type: 'object',
    properties: {
      chat_id: { type: 'string' },
      message_id: { type: 'string' },
      emoji: { type: 'string' },
    },
    required: ['chat_id', 'message_id', 'emoji'],
  },
}

export const handler: ToolHandler = async (args, context) => {
  const ch = await context.access.fetchAllowedChannel(context.client, args.chat_id as string)
  const msg = await ch.messages.fetch(args.message_id as string)
  await msg.react(args.emoji as string)
  return { content: [{ type: 'text', text: 'reacted' }] }
}
