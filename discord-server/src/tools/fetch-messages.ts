import type { ToolDefinition, ToolHandler } from '../types.js'

export const definition: ToolDefinition = {
  name: 'fetch_messages',
  description:
    "Fetch recent messages from a Discord channel. Returns oldest-first with message IDs. Discord's search API isn't exposed to bots, so this is the only way to look back.",
  inputSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string' },
      limit: {
        type: 'number',
        description: 'Max messages (default 20, Discord caps at 100).',
      },
    },
    required: ['channel'],
  },
}

export const handler: ToolHandler = async (args, context) => {
  const ch = await context.access.fetchAllowedChannel(context.client, args.channel as string)
  const limit = Math.min((args.limit as number) ?? 20, 100)
  const msgs = await ch.messages.fetch({ limit })
  const me = context.client.user?.id
  const arr = [...msgs.values()].reverse()
  const out =
    arr.length === 0
      ? '(no messages)'
      : arr
          .map(m => {
            const who = m.author.id === me ? 'me' : m.author.username
            const atts = m.attachments.size > 0 ? ` +${m.attachments.size}att` : ''
            const text = m.content.replace(/[\r\n]+/g, ' \u23CE ')
            return `[${m.createdAt.toISOString()}] ${who}: ${text}  (id: ${m.id}${atts})`
          })
          .join('\n')
  return { content: [{ type: 'text', text: out }] }
}
