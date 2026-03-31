import type { ToolDefinition, ToolHandler } from '../types.js'
import { connectToVoice } from '../voice/session.js'

export const definition: ToolDefinition = {
  name: 'join_voice',
  description:
    'Join a Discord voice channel. The bot will connect and stay in the channel until leave_voice is called. Requires the channel ID of a voice channel.',
  inputSchema: {
    type: 'object',
    properties: {
      channel_id: { type: 'string', description: 'The voice channel ID to join.' },
    },
    required: ['channel_id'],
  },
}

export const handler: ToolHandler = async (args, context) => {
  const channel_id = args.channel_id as string
  const ch = await context.client.channels.fetch(channel_id)
  if (!ch) throw new Error(`channel ${channel_id} not found`)
  if (!ch.isVoiceBased()) throw new Error(`channel ${channel_id} is not a voice channel`)
  if (!('guild' in ch) || !ch.guild) throw new Error(`channel ${channel_id} has no guild context`)

  // Guardrail: don't join an empty voice channel
  if ('members' in ch && ch.members) {
    const humans = (ch.members as Map<string, any>).size > 0
      ? [...(ch.members as Map<string, any>).values()].filter((m: any) => !m.user?.bot)
      : []
    if (humans.length === 0) {
      return {
        content: [{ type: 'text', text: `won't join an empty voice channel — no humans present` }],
      }
    }
  }

  await connectToVoice(ch.id, ch.guild.id, ch.guild.voiceAdapterCreator, context.client, context.injectSecret)

  return {
    content: [{ type: 'text', text: `joined voice channel ${channel_id} in guild ${ch.guild.id}` }],
  }
}
