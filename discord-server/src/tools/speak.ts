import type { ToolDefinition, ToolHandler } from '../types.js'
import { getVoiceConnection } from '@discordjs/voice'
import { existsSync } from 'fs'
import { playAudio } from '../voice/playback.js'

export const definition: ToolDefinition = {
  name: 'speak',
  description:
    'Play an audio file (WAV/OGG/MP3) in the currently connected voice channel. The bot must already be in a voice channel via join_voice. Generate audio externally (e.g. kokoro-speak.py) then pass the file path here. The file is deleted after playback.',
  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Absolute path to the audio file to play (WAV, OGG, or MP3).' },
      guild_id: { type: 'string', description: 'The guild ID where the bot is in a voice channel. Defaults to the first available voice connection if omitted.' },
      text: { type: 'string', description: 'The text that was spoken (for transcript logging). If provided, the bot\'s speech will appear in the VC session transcript.' },
    },
    required: ['file'],
  },
}

export const handler: ToolHandler = async (args, context) => {
  const filePath = args.file as string
  const guild_id = args.guild_id as string | undefined
  const spokenText = args.text as string | undefined

  if (!existsSync(filePath)) {
    throw new Error(`audio file not found: ${filePath}`)
  }

  // Find the voice connection
  let connection = guild_id ? getVoiceConnection(guild_id) : undefined
  let resolvedGuildId = guild_id

  if (!connection) {
    for (const [, guild] of context.client.guilds.cache) {
      const conn = getVoiceConnection(guild.id)
      if (conn) {
        connection = conn
        resolvedGuildId = guild.id
        break
      }
    }
  }

  if (!connection) {
    throw new Error(
      guild_id
        ? `not in a voice channel in guild ${guild_id} — call join_voice first`
        : 'not in any voice channel — call join_voice first'
    )
  }

  // Guardrail: skip playback if no humans remain
  {
    const vcChannelId = (connection as any).joinConfig?.channelId
    const vcGuildId = resolvedGuildId ?? (connection as any).joinConfig?.guildId
    if (vcChannelId && vcGuildId) {
      const guild = await context.client.guilds.fetch(vcGuildId)
      const vcChannel = await guild.channels.fetch(vcChannelId)
      if (vcChannel && 'members' in vcChannel && vcChannel.members) {
        const humans = [...(vcChannel.members as Map<string, any>).values()].filter((m: any) => !m.user?.bot)
        if (humans.length === 0) {
          return {
            content: [{ type: 'text', text: `skipping playback — no humans in the voice channel` }],
          }
        }
      }
    }
  }

  const result = await playAudio(connection, filePath, spokenText)
  return {
    content: [{ type: 'text', text: `played ${result.fileSizeKB}KB audio file in guild ${resolvedGuildId}` }],
  }
}
