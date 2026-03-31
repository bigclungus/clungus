#!/usr/bin/env bun
/**
 * Discord Bridge Bot — always-on standalone discord.js bot.
 *
 * Stays connected to Discord continuously; Claude's MCP bridge (mcp-bridge.ts)
 * polls this over HTTP instead of connecting directly. That way Claude can
 * restart without the Discord gateway bouncing.
 *
 * HTTP API on localhost:9999:
 *   GET  /messages?since=<rowid>   — poll queued messages
 *   POST /send                     — { chat_id, text, reply_to?, files? }
 *   POST /react                    — { chat_id, message_id, emoji }
 *   POST /edit                     — { chat_id, message_id, text }
 *   DELETE /message/:id            — mark message consumed (by rowid)
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
} from 'discord.js'
import { Database } from 'bun:sqlite'
import { readFileSync, chmodSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// ── Config ────────────────────────────────────────────────────────────────────

const STATE_DIR = process.env.DISCORD_STATE_DIR ?? join(homedir(), '.claude', 'channels', 'discord')
const ENV_FILE = join(STATE_DIR, '.env')
const ACCESS_FILE = join(STATE_DIR, 'access.json')
const DB_PATH = process.env.DISCORD_BRIDGE_DB ?? join(import.meta.dir, 'queue.db')
const HTTP_PORT = Number(process.env.DISCORD_BRIDGE_PORT ?? 9999)
const INBOX_DIR = join(STATE_DIR, 'inbox')
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

// Load .env (token lives here)
try {
  chmodSync(ENV_FILE, 0o600)
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^(\w+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
} catch {}

const TOKEN = process.env.DISCORD_BOT_TOKEN
if (!TOKEN) {
  process.stderr.write(`discord-bridge bot: DISCORD_BOT_TOKEN required (set in ${ENV_FILE})\n`)
  process.exit(1)
}

// ── SQLite queue ──────────────────────────────────────────────────────────────

const db = new Database(DB_PATH, { create: true })
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id   TEXT NOT NULL,
    msg_id    TEXT NOT NULL,
    author    TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content   TEXT NOT NULL,
    ts        TEXT NOT NULL,
    is_reaction INTEGER NOT NULL DEFAULT 0,
    emoji     TEXT,
    attachments TEXT,
    attachment_count INTEGER NOT NULL DEFAULT 0,
    consumed  INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_consumed ON messages(consumed, id);
`)

// Prune consumed messages older than 24h to keep the DB small
db.exec(`
  DELETE FROM messages
  WHERE consumed = 1
    AND created_at < unixepoch() - 86400;
`)

const insertMsg = db.prepare(`
  INSERT INTO messages (chat_id, msg_id, author, author_id, content, ts, is_reaction, emoji, attachments, attachment_count)
  VALUES ($chat_id, $msg_id, $author, $author_id, $content, $ts, $is_reaction, $emoji, $attachments, $attachment_count)
`)

const queryMessages = db.prepare(`
  SELECT * FROM messages
  WHERE consumed = 0 AND id > $since
  ORDER BY id ASC
  LIMIT 100
`)

const markConsumed = db.prepare(`
  UPDATE messages SET consumed = 1 WHERE id = $id
`)

// ── Access control (mirrors the original plugin's gate logic) ─────────────────

type GroupPolicy = { requireMention: boolean; allowFrom: string[] }
type Access = {
  dmPolicy: 'pairing' | 'allowlist' | 'disabled'
  allowFrom: string[]
  groups: Record<string, GroupPolicy>
  pending: Record<string, unknown>
  mentionPatterns?: string[]
  ackReaction?: string
}

function loadAccess(): Access {
  try {
    return JSON.parse(readFileSync(ACCESS_FILE, 'utf8')) as Access
  } catch {
    return { dmPolicy: 'pairing', allowFrom: [], groups: {}, pending: {} }
  }
}

const recentSentIds = new Set<string>()
const RECENT_SENT_CAP = 200
function noteSent(id: string): void {
  recentSentIds.add(id)
  if (recentSentIds.size > RECENT_SENT_CAP) {
    const first = recentSentIds.values().next().value
    if (first) recentSentIds.delete(first)
  }
}

async function isMentioned(msg: Message, extraPatterns?: string[]): Promise<boolean> {
  if (client.user && msg.mentions.has(client.user)) return true
  const refId = msg.reference?.messageId
  if (refId) {
    if (recentSentIds.has(refId)) return true
    try {
      const ref = await msg.fetchReference()
      if (ref.author.id === client.user?.id) return true
    } catch {}
  }
  for (const pat of extraPatterns ?? []) {
    try { if (new RegExp(pat, 'i').test(msg.content)) return true } catch {}
  }
  return false
}

async function shouldDeliver(msg: Message): Promise<boolean> {
  const access = loadAccess()
  if (access.dmPolicy === 'disabled') return false
  const isDM = msg.channel.type === ChannelType.DM
  if (isDM) {
    return access.allowFrom.includes(msg.author.id)
  }
  const channelId = msg.channel.isThread()
    ? msg.channel.parentId ?? msg.channelId
    : msg.channelId
  const policy = access.groups[channelId]
  if (!policy) return false
  if ((policy.allowFrom ?? []).length > 0 && !policy.allowFrom.includes(msg.author.id)) return false
  if (policy.requireMention ?? true) return isMentioned(msg, access.mentionPatterns)
  return true
}

function shouldDeliverReaction(channelId: string, userId: string): boolean {
  const access = loadAccess()
  if (access.dmPolicy === 'disabled') return false
  const policy = access.groups[channelId]
  if (!policy) return false
  if ((policy.allowFrom ?? []).length > 0 && !policy.allowFrom.includes(userId)) return false
  return true
}

// ── Discord client ────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
})

client.on('error', err => process.stderr.write(`discord-bridge: client error: ${err}\n`))

client.on('messageCreate', async msg => {
  if (msg.author.bot) return
  try {
    if (!(await shouldDeliver(msg))) return
    const atts: string[] = []
    for (const att of msg.attachments.values()) {
      const kb = (att.size / 1024).toFixed(0)
      const name = (att.name ?? att.id).replace(/[\[\]\r\n;]/g, '_')
      atts.push(`${name} (${att.contentType ?? 'unknown'}, ${kb}KB)`)
    }
    const content = msg.content || (atts.length > 0 ? '(attachment)' : '')
    insertMsg.run({
      $chat_id: msg.channelId,
      $msg_id: msg.id,
      $author: msg.author.username,
      $author_id: msg.author.id,
      $content: content,
      $ts: msg.createdAt.toISOString(),
      $is_reaction: 0,
      $emoji: null,
      $attachments: atts.length > 0 ? atts.join('; ') : null,
      $attachment_count: atts.length,
    })
    const access = loadAccess()
    if (access.ackReaction) {
      void msg.react(access.ackReaction).catch(() => {})
    }
    if ('sendTyping' in msg.channel) {
      void (msg.channel as any).sendTyping().catch(() => {})
    }
  } catch (e) {
    process.stderr.write(`discord-bridge: messageCreate error: ${e}\n`)
  }
})

client.on('messageReactionAdd', async (reaction, user) => {
  if ((user as User | PartialUser).bot) return
  try {
    const channelId = reaction.message.channelId
    if (!shouldDeliverReaction(channelId, user.id)) return
    const emoji = reaction.emoji
    const emojiStr = emoji.id ? `<:${emoji.name}:${emoji.id}>` : (emoji.name ?? '?')
    insertMsg.run({
      $chat_id: channelId,
      $msg_id: reaction.message.id,
      $author: (user as any).username ?? user.id,
      $author_id: user.id,
      $content: `(reaction: ${emojiStr})`,
      $ts: new Date().toISOString(),
      $is_reaction: 1,
      $emoji: emojiStr,
      $attachments: null,
      $attachment_count: 0,
    })
  } catch (e) {
    process.stderr.write(`discord-bridge: reactionAdd error: ${e}\n`)
  }
})

client.once('ready', c => {
  process.stderr.write(`discord-bridge: gateway connected as ${c.user.tag}\n`)
})

// ── HTTP API ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function fetchTextChannel(id: string) {
  const ch = await client.channels.fetch(id)
  if (!ch || !ch.isTextBased()) throw new Error(`channel ${id} not found or not text-based`)
  return ch
}

const MAX_CHUNK = 2000
function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text]
  const out: string[] = []
  let rest = text
  while (rest.length > MAX_CHUNK) {
    let cut = MAX_CHUNK
    const para = rest.lastIndexOf('\n\n', MAX_CHUNK)
    const line = rest.lastIndexOf('\n', MAX_CHUNK)
    const space = rest.lastIndexOf(' ', MAX_CHUNK)
    cut = para > MAX_CHUNK / 2 ? para : line > MAX_CHUNK / 2 ? line : space > 0 ? space : MAX_CHUNK
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n+/, '')
  }
  if (rest) out.push(rest)
  return out
}

const server = Bun.serve({
  port: HTTP_PORT,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url)

    // GET /messages?since=<rowid>
    if (req.method === 'GET' && url.pathname === '/messages') {
      const since = Number(url.searchParams.get('since') ?? '0')
      const rows = queryMessages.all({ $since: since })
      return json(rows)
    }

    // POST /send — { chat_id, text, reply_to?, files? }
    if (req.method === 'POST' && url.pathname === '/send') {
      try {
        const body = await req.json() as { chat_id: string; text: string; reply_to?: string; files?: string[] }
        const ch = await fetchTextChannel(body.chat_id)
        if (!('send' in ch)) return json({ error: 'channel not sendable' }, 400)
        const files = (body.files ?? []).filter(f => {
          try { return statSync(f).size <= MAX_ATTACHMENT_BYTES } catch { return false }
        })
        const chunks = chunkText(body.text)
        const sentIds: string[] = []
        for (let i = 0; i < chunks.length; i++) {
          const sent = await (ch as any).send({
            content: chunks[i],
            ...(i === 0 && files.length > 0 ? { files } : {}),
            ...(body.reply_to && i === 0
              ? { reply: { messageReference: body.reply_to, failIfNotExists: false } }
              : {}),
          })
          noteSent(sent.id)
          sentIds.push(sent.id)
        }
        return json({ ok: true, ids: sentIds })
      } catch (e) {
        return json({ error: String(e) }, 500)
      }
    }

    // POST /react — { chat_id, message_id, emoji }
    if (req.method === 'POST' && url.pathname === '/react') {
      try {
        const body = await req.json() as { chat_id: string; message_id: string; emoji: string }
        const ch = await fetchTextChannel(body.chat_id)
        const msg = await (ch as any).messages.fetch(body.message_id)
        await msg.react(body.emoji)
        return json({ ok: true })
      } catch (e) {
        return json({ error: String(e) }, 500)
      }
    }

    // POST /edit — { chat_id, message_id, text }
    if (req.method === 'POST' && url.pathname === '/edit') {
      try {
        const body = await req.json() as { chat_id: string; message_id: string; text: string }
        const ch = await fetchTextChannel(body.chat_id)
        const msg = await (ch as any).messages.fetch(body.message_id)
        const edited = await msg.edit(body.text)
        return json({ ok: true, id: edited.id })
      } catch (e) {
        return json({ error: String(e) }, 500)
      }
    }

    // DELETE /message/:id — mark consumed
    if (req.method === 'DELETE' && url.pathname.startsWith('/message/')) {
      const rowid = Number(url.pathname.split('/').pop())
      if (!Number.isFinite(rowid)) return json({ error: 'invalid id' }, 400)
      markConsumed.run({ $id: rowid })
      return json({ ok: true })
    }

    // GET /health
    if (req.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, ready: client.isReady(), tag: client.user?.tag ?? null })
    }

    // POST /fetch — { channel, limit } -> fetch live Discord history
    if (req.method === 'POST' && url.pathname === '/fetch') {
      try {
        const body = await req.json() as { channel: string; limit?: number }
        const ch = await fetchTextChannel(body.channel)
        const limit = Math.min(body.limit ?? 20, 100)
        const msgs = await (ch as any).messages.fetch({ limit })
        const me = client.user?.id
        const arr = [...msgs.values()].reverse()
        const out = arr.length === 0
          ? '(no messages)'
          : arr.map((m: any) => {
              const who = m.author.id === me ? 'me' : m.author.username
              const atts = m.attachments.size > 0 ? ` +${m.attachments.size}att` : ''
              const text = m.content.replace(/[\r\n]+/g, ' ⏎ ')
              return `[${m.createdAt.toISOString()}] ${who}: ${text}  (id: ${m.id}${atts})`
            }).join('\n')
        return json({ text: out })
      } catch (e) {
        return json({ error: String(e) }, 500)
      }
    }

    // POST /download — { chat_id, message_id } -> download attachments to inbox
    if (req.method === 'POST' && url.pathname === '/download') {
      try {
        const body = await req.json() as { chat_id: string; message_id: string }
        const ch = await fetchTextChannel(body.chat_id)
        const msg = await (ch as any).messages.fetch(body.message_id)
        if (msg.attachments.size === 0) return json({ files: [] })
        mkdirSync(INBOX_DIR, { recursive: true })
        const results: { path: string; name: string; type: string; kb: number }[] = []
        for (const att of msg.attachments.values()) {
          if (att.size > MAX_ATTACHMENT_BYTES) continue
          const res = await fetch(att.url)
          const buf = Buffer.from(await res.arrayBuffer())
          const name = (att.name ?? att.id).replace(/[^a-zA-Z0-9._-]/g, '_')
          const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : 'bin'
          const path = join(INBOX_DIR, `${Date.now()}-${att.id}.${ext}`)
          writeFileSync(path, buf)
          results.push({ path, name: att.name ?? att.id, type: att.contentType ?? 'unknown', kb: Math.round(att.size / 1024) })
        }
        return json({ files: results })
      } catch (e) {
        return json({ error: String(e) }, 500)
      }
    }

    return json({ error: 'not found' }, 404)
  },
})

process.stderr.write(`discord-bridge: HTTP API listening on 127.0.0.1:${HTTP_PORT}\n`)

process.on('unhandledRejection', err => process.stderr.write(`discord-bridge: unhandled rejection: ${err}\n`))
process.on('uncaughtException', err => process.stderr.write(`discord-bridge: uncaught exception: ${err}\n`))

await client.login(TOKEN).catch(err => {
  process.stderr.write(`discord-bridge: login failed: ${err}\n`)
  process.exit(1)
})
