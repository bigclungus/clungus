/**
 * Voice connection lifecycle: connect and disconnect.
 *
 * Extracted from discord-plugin/server.ts lines 79-114.
 */

import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} from '@discordjs/voice'
import type { Client } from 'discord.js'
import { setupVoiceReceive } from './receive.js'

export async function connectToVoice(
  channelId: string,
  guildId: string,
  adapterCreator: any,
  discordClient: Client,
  injectSecret: string | undefined,
): Promise<void> {
  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: adapterCreator as any,
    selfDeaf: false,
    selfMute: false,
  })

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000)
  } catch (err) {
    connection.destroy()
    throw new Error(`failed to join voice channel: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (injectSecret) {
    const teardown = setupVoiceReceive(connection, discordClient, injectSecret)
    ;(connection as any)._voiceReceiveTeardown = teardown
  }
}

export async function disconnectFromVoice(guildId: string): Promise<boolean> {
  const connection = getVoiceConnection(guildId)
  if (!connection) return false
  const teardown = (connection as any)._voiceReceiveTeardown
  if (teardown) await teardown()
  connection.destroy()
  return true
}
