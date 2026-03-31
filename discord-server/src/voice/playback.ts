/**
 * TTS playback queue — plays audio through a voice connection.
 *
 * Extracted from discord-plugin/server.ts speak tool handler (lines 893-936).
 */

import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  type VoiceConnection,
} from '@discordjs/voice'
import { unlinkSync, statSync } from 'fs'

export interface PlaybackResult {
  fileSizeKB: string
}

/**
 * Play an audio file through a voice connection.
 * Deletes the file after playback (or on error).
 * Logs bot speech to the voice receive transcript if available.
 */
export async function playAudio(
  connection: VoiceConnection,
  filePath: string,
  spokenText?: string,
): Promise<PlaybackResult> {
  try {
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    })
    const resource = createAudioResource(filePath)

    connection.subscribe(player)
    player.play(resource)

    // Wait for playback to finish
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const onIdle = () => { if (!settled) { settled = true; cleanup(); resolve() } }
      const onError = (err: Error) => { if (!settled) { settled = true; cleanup(); reject(new Error(`audio playback error: ${err.message}`)) } }
      const timer = setTimeout(() => { if (!settled) { settled = true; cleanup(); reject(new Error('speak timed out after 120s')) } }, 120_000)

      function cleanup() {
        clearTimeout(timer)
        player.removeListener(AudioPlayerStatus.Idle, onIdle)
        player.removeListener('error', onError)
      }

      player.on(AudioPlayerStatus.Idle, onIdle)
      player.on('error', onError)
    })

    // Log bot speech to session transcript
    if (spokenText) {
      const teardown = (connection as any)._voiceReceiveTeardown
      if (teardown?.logBotSpeech) {
        teardown.logBotSpeech(spokenText)
      }
    }

    const fileSize = statSync(filePath).size
    return { fileSizeKB: (fileSize / 1024).toFixed(0) }
  } finally {
    try { unlinkSync(filePath) } catch {}
  }
}
