/**
 * Discord client init, event handlers, connection management.
 *
 * Extracted from discord-plugin/server.ts — Client creation, shard lifecycle,
 * interaction handler, voiceStateUpdate, messageCreate/reaction/delete/update.
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  type Message,
  type Interaction,
} from 'discord.js'
import { getVoiceConnection } from '@discordjs/voice'
import { z } from 'zod'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { NotificationEmitter } from './notifications.js'
import {
  handleInbound,
  emitReaction,
  emitDelete,
  emitEdit,
} from './notifications.js'
import { loadAccess, isDmChannelKnown } from './access.js'
import { connectToVoice, disconnectFromVoice } from './voice/session.js'

// ── Auto-voice channel ───────────────────────────────────────────────────────

const AUTO_VOICE_CHANNEL = '1325567700029931560'

// ── Pending permission details for "See more" expansion ──────────────────────

const pendingPermissions = new Map<string, { tool_name: string; description: string; input_preview: string }>()

// ── Client creation ──────────────────────────────────────────────────────────

export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
    closeTimeout: 15_000,
  })
}

// ── Permission request handler ───────────────────────────────────────────────

export function setupPermissionHandler(mcpServer: Server, client: Client): void {
  mcpServer.setNotificationHandler(
    z.object({
      method: z.literal('notifications/claude/channel/permission_request'),
      params: z.object({
        request_id: z.string(),
        tool_name: z.string(),
        description: z.string(),
        input_preview: z.string(),
      }),
    }),
    async ({ params }) => {
      const { request_id, tool_name, description, input_preview } = params
      pendingPermissions.set(request_id, { tool_name, description, input_preview })
      const access = loadAccess()
      const text = `\uD83D\uDD10 Permission: ${tool_name}`
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`perm:more:${request_id}`)
          .setLabel('See more')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`perm:allow:${request_id}`)
          .setLabel('Allow')
          .setEmoji('\u2705')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`perm:deny:${request_id}`)
          .setLabel('Deny')
          .setEmoji('\u274C')
          .setStyle(ButtonStyle.Danger),
      )
      for (const userId of access.allowFrom) {
        void (async () => {
          try {
            const user = await client.users.fetch(userId)
            await user.send({ content: text, components: [row] })
          } catch (e) {
            process.stderr.write(`permission_request send to ${userId} failed: ${e}\n`)
          }
        })()
      }
    },
  )
}

// ── Register all Discord event handlers ──────────────────────────────────────

export function registerEventHandlers(
  client: Client,
  emitter: NotificationEmitter,
): void {
  // Shard lifecycle telemetry
  client.on('error', err => {
    process.stderr.write(`discord channel: client error: ${err}\n`)
  })

  client.on('shardDisconnect', (event, shardId) => {
    process.stderr.write(`discord channel: shard ${shardId} disconnected (code=${event.code})\n`)
  })
  client.on('shardReconnecting', shardId => {
    process.stderr.write(`discord channel: shard ${shardId} reconnecting\n`)
  })
  client.on('shardResume', (shardId, replayedEvents) => {
    process.stderr.write(`discord channel: shard ${shardId} resumed (replayed=${replayedEvents})\n`)
  })
  client.on('shardError', (err, shardId) => {
    process.stderr.write(`discord channel: shard ${shardId} error: ${err}\n`)
  })
  client.on('invalidated', () => {
    process.stderr.write('discord channel: session invalidated — exiting for systemd restart\n')
    process.exit(1)
  })

  // Button-click handler for permission requests
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isButton()) return
    const m = /^perm:(allow|deny|more):([a-km-z]{5})$/.exec(interaction.customId)
    if (!m) return
    const access = loadAccess()
    if (!access.allowFrom.includes(interaction.user.id)) {
      await interaction.reply({ content: 'Not authorized.', ephemeral: true }).catch(() => {})
      return
    }
    const [, behavior, request_id] = m

    if (behavior === 'more') {
      const details = pendingPermissions.get(request_id!)
      if (!details) {
        await interaction.reply({ content: 'Details no longer available.', ephemeral: true }).catch(() => {})
        return
      }
      const { tool_name, description, input_preview } = details
      let prettyInput: string
      try {
        prettyInput = JSON.stringify(JSON.parse(input_preview), null, 2)
      } catch {
        prettyInput = input_preview
      }
      const expanded =
        `\uD83D\uDD10 Permission: ${tool_name}\n\n` +
        `tool_name: ${tool_name}\n` +
        `description: ${description}\n` +
        `input_preview:\n${prettyInput}`
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`perm:allow:${request_id}`)
          .setLabel('Allow')
          .setEmoji('\u2705')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`perm:deny:${request_id}`)
          .setLabel('Deny')
          .setEmoji('\u274C')
          .setStyle(ButtonStyle.Danger),
      )
      await interaction.update({ content: expanded, components: [row] }).catch(() => {})
      return
    }

    void emitter.emit('notifications/claude/channel/permission', {
      request_id: request_id!,
      behavior: behavior!,
    })
    pendingPermissions.delete(request_id!)
    const label = behavior === 'allow' ? '\u2705 Allowed' : '\u274C Denied'
    await interaction
      .update({ content: `${interaction.message.content}\n\n${label}`, components: [] })
      .catch(() => {})
  })

  // Message create
  client.on('messageCreate', (msg: Message) => {
    const ts = new Date().toISOString()
    const author = `${msg.author.username}${msg.author.bot ? '[bot]' : ''}`
    const content = (msg.content || '<empty>').slice(0, 100).replace(/\n/g, '\\n')
    process.stderr.write(`discord-msg: ${ts} | ${author} | ch:${msg.channelId} | ${content}\n`)

    if (msg.author.bot) return
    handleInbound(msg, client, emitter).catch(e =>
      process.stderr.write(`discord: handleInbound failed: ${e}\n`),
    )
  })

  // Voice state update — auto-join/leave
  client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      const joinedTarget = newState.channelId === AUTO_VOICE_CHANNEL && oldState.channelId !== AUTO_VOICE_CHANNEL
      const leftTarget = oldState.channelId === AUTO_VOICE_CHANNEL && newState.channelId !== AUTO_VOICE_CHANNEL

      if (joinedTarget && !newState.member?.user.bot) {
        const guild = newState.guild
        const existing = getVoiceConnection(guild.id)
        if (existing) return

        const ch = await client.channels.fetch(AUTO_VOICE_CHANNEL)
        if (!ch || !ch.isVoiceBased() || !('guild' in ch) || !ch.guild) return

        try {
          await connectToVoice(ch.id, ch.guild.id, ch.guild.voiceAdapterCreator, client, process.env.DISCORD_INJECT_SECRET)
          process.stderr.write(`discord: auto-joined voice channel ${AUTO_VOICE_CHANNEL}\n`)
        } catch (err) {
          process.stderr.write(`discord: failed to auto-join voice: ${err instanceof Error ? err.message : String(err)}\n`)
        }
        return
      }

      if (leftTarget) {
        const guild = oldState.guild
        const ch = guild.channels.cache.get(AUTO_VOICE_CHANNEL)
        if (!ch || !ch.isVoiceBased()) return

        const humanMembers = ch.members.filter(m => !m.user.bot)
        if (humanMembers.size === 0) {
          if (await disconnectFromVoice(guild.id)) {
            process.stderr.write(`discord: auto-left voice channel ${AUTO_VOICE_CHANNEL} (no humans remaining)\n`)
          }
        }
      }
    } catch (err) {
      process.stderr.write(`discord: voiceStateUpdate error: ${err instanceof Error ? err.message : String(err)}\n`)
    }
  })

  // Reaction notifications
  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      if (user.bot) return

      if (reaction.partial) {
        try { await reaction.fetch() } catch { return }
      }
      if (user.partial) {
        try { await user.fetch() } catch { return }
      }

      const msg = reaction.message
      const fullMsg = msg.partial ? await msg.fetch().catch(() => null) : msg
      if (!fullMsg) return

      // Gate check
      const access = loadAccess()
      const channelId = fullMsg.channelId
      const ch = await client.channels.fetch(channelId).catch(() => null)
      if (!ch) return

      let allowed = false
      if (ch.type === ChannelType.DM) {
        const dmCh = ch as import('discord.js').DMChannel
        allowed = access.allowFrom.includes(dmCh.recipientId ?? '') || isDmChannelKnown(channelId)
      } else {
        const key = ch.isThread?.() ? (ch as import('discord.js').ThreadChannel).parentId ?? channelId : channelId
        allowed = key in access.groups
      }
      if (!allowed) return

      const emoji = reaction.emoji.toString()
      const msgAtts = [...fullMsg.attachments.values()]
      const attParts = msgAtts.map(a => `<attachment name="${a.name}" type="${a.contentType ?? 'unknown'}" url="${a.url}" />`)

      emitReaction(
        emitter,
        channelId,
        fullMsg.id,
        user.username,
        user.id,
        emoji,
        fullMsg.author?.username ?? 'unknown',
        fullMsg.content || '',
        fullMsg.createdAt.toISOString(),
        ch.isThread?.() ?? false,
        attParts,
      )
    } catch (err) {
      process.stderr.write(`discord channel: messageReactionAdd error: ${err}\n`)
    }
  })

  // Message delete notifications
  client.on('messageDelete', async (msg) => {
    try {
      if (msg.author?.bot) return

      const channelId = msg.channelId
      const ch = await client.channels.fetch(channelId).catch(() => null)
      if (!ch) return

      const access = loadAccess()
      let allowed = false
      if (ch.type === ChannelType.DM) {
        const dmCh = ch as import('discord.js').DMChannel
        allowed = access.allowFrom.includes(dmCh.recipientId ?? '') || isDmChannelKnown(channelId)
      } else {
        const key = ch.isThread?.() ? (ch as import('discord.js').ThreadChannel).parentId ?? channelId : channelId
        allowed = key in access.groups
      }
      if (!allowed) return

      emitDelete(
        emitter,
        channelId,
        msg.id,
        msg.author?.username ?? 'unknown',
        msg.content ?? null,
        ('name' in ch && (ch as any).name) || null,
        ch.isThread?.() ?? false,
      )
    } catch (err) {
      process.stderr.write(`discord channel: messageDelete error: ${err}\n`)
    }
  })

  // Message update notifications
  client.on('messageUpdate', async (oldMsg, newMsg) => {
    try {
      const fullNew = newMsg.partial ? await newMsg.fetch().catch(() => null) : newMsg
      if (!fullNew) return
      if (fullNew.author?.bot) return

      const oldContent = oldMsg.content
      const newContent = fullNew.content
      if (oldContent === newContent) return

      const channelId = fullNew.channelId
      const ch = await client.channels.fetch(channelId).catch(() => null)
      if (!ch) return

      const access = loadAccess()
      let allowed = false
      if (ch.type === ChannelType.DM) {
        const dmCh = ch as import('discord.js').DMChannel
        allowed = access.allowFrom.includes(dmCh.recipientId ?? '') || isDmChannelKnown(channelId)
      } else {
        const key = ch.isThread?.() ? (ch as import('discord.js').ThreadChannel).parentId ?? channelId : channelId
        allowed = key in access.groups
      }
      if (!allowed) return

      emitEdit(
        emitter,
        channelId,
        fullNew.id,
        fullNew.author?.username ?? 'unknown',
        oldContent ?? null,
        newContent ?? '',
        ch.isThread?.() ?? false,
        fullNew.editedAt?.toISOString() ?? new Date().toISOString(),
      )
    } catch (err) {
      process.stderr.write(`discord channel: messageUpdate error: ${err}\n`)
    }
  })

  // Ready event
  client.once('clientReady', c => {
    process.stderr.write(`discord channel: gateway connected as ${c.user.tag}\n`)
  })
}
