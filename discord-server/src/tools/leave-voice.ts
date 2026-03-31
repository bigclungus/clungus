import type { ToolDefinition, ToolHandler } from '../types.js'
import { disconnectFromVoice } from '../voice/session.js'

export const definition: ToolDefinition = {
  name: 'leave_voice',
  description:
    'Leave the current voice channel in a guild. Pass the guild_id to identify which voice connection to disconnect.',
  inputSchema: {
    type: 'object',
    properties: {
      guild_id: { type: 'string', description: 'The guild ID to leave the voice channel in.' },
    },
    required: ['guild_id'],
  },
}

export const handler: ToolHandler = async (args) => {
  const guild_id = args.guild_id as string
  if (!(await disconnectFromVoice(guild_id))) {
    return {
      content: [{ type: 'text', text: `not in a voice channel in guild ${guild_id}` }],
    }
  }
  return {
    content: [{ type: 'text', text: `left voice channel in guild ${guild_id}` }],
  }
}
