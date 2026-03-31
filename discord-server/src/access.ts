/**
 * Access control: allowlist, pairing, DM/group policy, outbound gating.
 *
 * Extracted from discord-plugin/server.ts lines 48-475.
 */

import {
  ChannelType,
  type Client,
  type Message,
} from 'discord.js'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  renameSync,
  chmodSync,
  realpathSync,
  statSync,
} from 'fs'
import { homedir } from 'os'
import { join, sep } from 'path'
import { randomBytes } from 'crypto'

// ── Paths & env ──────────────────────────────────────────────────────────────

const STATE_DIR = process.env.DISCORD_STATE_DIR ?? join(homedir(), '.claude', 'channels', 'discord')
const ACCESS_FILE = join(STATE_DIR, 'access.json')
const APPROVED_DIR = join(STATE_DIR, 'approved')
const ENV_FILE = join(STATE_DIR, '.env')
const INBOX_DIR = join(STATE_DIR, 'inbox')

export { STATE_DIR, INBOX_DIR }

// ── Env loading ──────────────────────────────────────────────────────────────

export function loadEnvFile(): void {
  try {
    chmodSync(ENV_FILE, 0o600)
    for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = line.match(/^(\w+)=(.*)$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
    }
  } catch {}
}

// ── Types ────────────────────────────────────────────────────────────────────

type PendingEntry = {
  senderId: string
  chatId: string
  createdAt: number
  expiresAt: number
  replies: number
}

type GroupPolicy = {
  requireMention: boolean
  allowFrom: string[]
}

export type Access = {
  dmPolicy: 'pairing' | 'allowlist' | 'disabled'
  allowFrom: string[]
  groups: Record<string, GroupPolicy>
  pending: Record<string, PendingEntry>
  mentionPatterns?: string[]
  ackReaction?: string
  replyToMode?: 'off' | 'first' | 'all'
  textChunkLimit?: number
  chunkMode?: 'length' | 'newline'
}

export type GateResult =
  | { action: 'deliver'; access: Access }
  | { action: 'drop' }
  | { action: 'pair'; code: string; isResend: boolean }

// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_CHUNK_LIMIT = 2000
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

// Permission-reply regex from anthropics/claude-cli-internal
export const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i

// ── Access file management ───────────────────────────────────────────────────

function defaultAccess(): Access {
  return {
    dmPolicy: 'pairing',
    allowFrom: [],
    groups: {},
    pending: {},
  }
}

function readAccessFile(): Access {
  try {
    const raw = readFileSync(ACCESS_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<Access>
    return {
      dmPolicy: parsed.dmPolicy ?? 'pairing',
      allowFrom: parsed.allowFrom ?? [],
      groups: parsed.groups ?? {},
      pending: parsed.pending ?? {},
      mentionPatterns: parsed.mentionPatterns,
      ackReaction: parsed.ackReaction,
      replyToMode: parsed.replyToMode,
      textChunkLimit: parsed.textChunkLimit,
      chunkMode: parsed.chunkMode,
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultAccess()
    try { renameSync(ACCESS_FILE, `${ACCESS_FILE}.corrupt-${Date.now()}`) } catch {}
    process.stderr.write(`discord: access.json is corrupt, moved aside. Starting fresh.\n`)
    return defaultAccess()
  }
}

// Static mode: snapshot access at boot, no writes.
const STATIC = process.env.DISCORD_ACCESS_MODE === 'static'
const BOOT_ACCESS: Access | null = STATIC
  ? (() => {
      const a = readAccessFile()
      if (a.dmPolicy === 'pairing') {
        process.stderr.write('discord channel: static mode — dmPolicy "pairing" downgraded to "allowlist"\n')
        a.dmPolicy = 'allowlist'
      }
      a.pending = {}
      return a
    })()
  : null

export function loadAccess(): Access {
  return BOOT_ACCESS ?? readAccessFile()
}

export function saveAccess(a: Access): void {
  if (STATIC) return
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
  const tmp = ACCESS_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(a, null, 2) + '\n', { mode: 0o600 })
  renameSync(tmp, ACCESS_FILE)
}

export function pruneExpired(a: Access): boolean {
  const now = Date.now()
  let changed = false
  for (const [code, p] of Object.entries(a.pending)) {
    if (p.expiresAt < now) {
      delete a.pending[code]
      changed = true
    }
  }
  return changed
}

// ── Recent sent IDs (for reply-to-bot detection) ────────────────────────────

const recentSentIds = new Set<string>()
const RECENT_SENT_CAP = 200

export function noteSent(id: string): void {
  recentSentIds.add(id)
  if (recentSentIds.size > RECENT_SENT_CAP) {
    const first = recentSentIds.values().next().value
    if (first) recentSentIds.delete(first)
  }
}

export function hasSentId(id: string): boolean {
  return recentSentIds.has(id)
}

// ── Seen threads (cold-thread detection) ─────────────────────────────────────

const seenThreads = new Map<string, number>()
export const THREAD_COLD_MS = 5 * 60 * 1000

export function markThreadSeen(threadId: string): boolean {
  const now = Date.now()
  const lastSeen = seenThreads.get(threadId)
  const isCold = lastSeen === undefined || (now - lastSeen) > THREAD_COLD_MS
  seenThreads.set(threadId, now)

  // Prune stale entries
  if (isCold) {
    for (const [id, ts] of seenThreads.entries()) {
      if (now - ts > THREAD_COLD_MS) seenThreads.delete(id)
    }
  }
  return isCold
}

// ── Recent DM channels (for outbound reply validation) ──────────────────────

const recentDmChannels = new Set<string>()
const DM_CHANNEL_CAP = 50

export function noteDmChannel(channelId: string): void {
  recentDmChannels.add(channelId)
  if (recentDmChannels.size > DM_CHANNEL_CAP) {
    const first = recentDmChannels.values().next().value
    if (first) recentDmChannels.delete(first)
  }
}

export function isDmChannelKnown(channelId: string): boolean {
  return recentDmChannels.has(channelId)
}

// ── Gate ──────────────────────────────────────────────────────────────────────

export async function gate(msg: Message, client: Client): Promise<GateResult> {
  const access = loadAccess()
  const pruned = pruneExpired(access)
  if (pruned) saveAccess(access)

  if (access.dmPolicy === 'disabled') return { action: 'drop' }

  const senderId = msg.author.id
  const isDM = msg.channel.type === ChannelType.DM

  if (isDM) {
    if (access.allowFrom.includes(senderId)) {
      noteDmChannel(msg.channelId)
      return { action: 'deliver', access }
    }
    if (access.dmPolicy === 'allowlist') return { action: 'drop' }

    // pairing mode
    for (const [code, p] of Object.entries(access.pending)) {
      if (p.senderId === senderId) {
        if ((p.replies ?? 1) >= 2) return { action: 'drop' }
        p.replies = (p.replies ?? 1) + 1
        saveAccess(access)
        return { action: 'pair', code, isResend: true }
      }
    }
    if (Object.keys(access.pending).length >= 3) return { action: 'drop' }

    const code = randomBytes(3).toString('hex')
    const now = Date.now()
    access.pending[code] = {
      senderId,
      chatId: msg.channelId,
      createdAt: now,
      expiresAt: now + 60 * 60 * 1000,
      replies: 1,
    }
    saveAccess(access)
    return { action: 'pair', code, isResend: false }
  }

  // Guild channel — key on channel ID, threads inherit parent
  const channelId = msg.channel.isThread()
    ? msg.channel.parentId ?? msg.channelId
    : msg.channelId
  const policy = access.groups[channelId]
  if (!policy) return { action: 'drop' }
  const groupAllowFrom = policy.allowFrom ?? []
  const requireMention = policy.requireMention ?? true
  if (groupAllowFrom.length > 0 && !groupAllowFrom.includes(senderId)) {
    return { action: 'drop' }
  }
  if (requireMention && !(await isMentioned(msg, client, access.mentionPatterns))) {
    return { action: 'drop' }
  }
  return { action: 'deliver', access }
}

async function isMentioned(msg: Message, client: Client, extraPatterns?: string[]): Promise<boolean> {
  if (client.user && msg.mentions.has(client.user)) return true

  const refId = msg.reference?.messageId
  if (refId) {
    if (hasSentId(refId)) return true
    try {
      const ref = await msg.fetchReference()
      if (ref.author.id === client.user?.id) return true
    } catch {}
  }

  const text = msg.content
  for (const pat of extraPatterns ?? []) {
    try {
      if (new RegExp(pat, 'i').test(text)) return true
    } catch {}
  }
  return false
}

// ── Approval polling ─────────────────────────────────────────────────────────

export function startApprovalPolling(client: Client): void {
  if (STATIC) return

  function checkApprovals(): void {
    let files: string[]
    try {
      files = readdirSync(APPROVED_DIR)
    } catch {
      return
    }
    if (files.length === 0) return

    for (const senderId of files) {
      const file = join(APPROVED_DIR, senderId)
      let dmChannelId: string
      try {
        dmChannelId = readFileSync(file, 'utf8').trim()
      } catch {
        rmSync(file, { force: true })
        continue
      }
      if (!dmChannelId) {
        rmSync(file, { force: true })
        continue
      }

      void (async () => {
        try {
          const ch = await fetchTextChannel(client, dmChannelId)
          if ('send' in ch) {
            await ch.send("Paired! Say hi to Claude.")
          }
          rmSync(file, { force: true })
        } catch (err) {
          process.stderr.write(`discord channel: failed to send approval confirm: ${err}\n`)
          rmSync(file, { force: true })
        }
      })()
    }
  }

  setInterval(checkApprovals, 5000).unref()
}

// ── Channel fetching ─────────────────────────────────────────────────────────

export async function fetchTextChannel(client: Client, id: string) {
  const ch = await client.channels.fetch(id)
  if (!ch || !ch.isTextBased()) {
    throw new Error(`channel ${id} not found or not text-based`)
  }
  return ch
}

export async function fetchAllowedChannel(client: Client, id: string) {
  let ch = await fetchTextChannel(client, id)
  const access = loadAccess()
  if (ch.type === ChannelType.DM) {
    let recipientId: string | undefined = (ch as any).recipientId
    // recipientId can be undefined when the DM channel was cached as a partial
    // (discord.js only sets it when data.recipients is present in the API response).
    // Force-fetch to get the full channel data.
    if (!recipientId) {
      try {
        ch = await client.channels.fetch(id, { force: true }) as typeof ch
        recipientId = (ch as any).recipientId
      } catch {}
    }
    if (recipientId && access.allowFrom.includes(recipientId)) return ch
    // Last resort: check if any allowlisted user has a cached DM with this channel ID.
    // This covers the case where the API still doesn't return recipients.
    if (!recipientId) {
      for (const userId of access.allowFrom) {
        const cached = client.channels.cache.find(
          c => c.type === ChannelType.DM && (c as any).recipientId === userId && c.id === id
        )
        if (cached) return ch
      }
      // If the channel is a DM and we received a message in it (it passed the
      // inbound gate), it's safe to allow replies. The DM channel ID itself
      // serves as proof that the bot has an active DM with a user.
      // Check if we've recently seen this channel in inbound messages.
      if (recentDmChannels.has(id)) return ch
    }
  } else {
    const key = ch.isThread() ? (ch as any).parentId ?? ch.id : ch.id
    if (key in access.groups) return ch
  }
  throw new Error(`channel ${id} is not allowlisted — add via /discord:access`)
}

// ── File safety ──────────────────────────────────────────────────────────────

export function assertSendable(f: string): void {
  let real: string, stateReal: string
  try {
    real = realpathSync(f)
    stateReal = realpathSync(STATE_DIR)
  } catch { return }
  const inbox = join(stateReal, 'inbox')
  if (real.startsWith(stateReal + sep) && !real.startsWith(inbox + sep)) {
    throw new Error(`refusing to send channel state: ${f}`)
  }
}

// ── Attachment helpers ───────────────────────────────────────────────────────

export async function downloadAttachment(att: { size: number; url: string; name?: string; id: string; contentType?: string | null }): Promise<string> {
  if (att.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`attachment too large: ${(att.size / 1024 / 1024).toFixed(1)}MB, max ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB`)
  }
  const res = await fetch(att.url)
  const buf = Buffer.from(await res.arrayBuffer())
  const name = att.name ?? `${att.id}`
  const rawExt = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : 'bin'
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, '') || 'bin'
  const path = join(INBOX_DIR, `${Date.now()}-${att.id}.${ext}`)
  mkdirSync(INBOX_DIR, { recursive: true })
  writeFileSync(path, buf)
  return path
}

export function safeAttName(att: { name?: string; id: string }): string {
  return (att.name ?? att.id).replace(/[\[\]\r\n;]/g, '_')
}

// ── Chunk splitting ──────────────────────────────────────────────────────────

export function chunk(text: string, limit: number, mode: 'length' | 'newline'): string[] {
  if (text.length <= limit) return [text]
  const out: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = limit
    if (mode === 'newline') {
      const para = rest.lastIndexOf('\n\n', limit)
      const line = rest.lastIndexOf('\n', limit)
      const space = rest.lastIndexOf(' ', limit)
      cut = para > limit / 2 ? para : line > limit / 2 ? line : space > 0 ? space : limit
    }
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n+/, '')
  }
  if (rest) out.push(rest)
  return out
}

// ── Exported module interface for DI ─────────────────────────────────────────

export type AccessModule = {
  loadAccess: typeof loadAccess
  saveAccess: typeof saveAccess
  gate: typeof gate
  noteSent: typeof noteSent
  hasSentId: typeof hasSentId
  markThreadSeen: typeof markThreadSeen
  fetchAllowedChannel: typeof fetchAllowedChannel
  fetchTextChannel: typeof fetchTextChannel
  assertSendable: typeof assertSendable
  downloadAttachment: typeof downloadAttachment
  safeAttName: typeof safeAttName
  chunk: typeof chunk
  THREAD_COLD_MS: number
  MAX_CHUNK_LIMIT: number
  MAX_ATTACHMENT_BYTES: number
  PERMISSION_REPLY_RE: RegExp
}

export const accessModule: AccessModule = {
  loadAccess,
  saveAccess,
  gate,
  noteSent,
  hasSentId,
  markThreadSeen,
  fetchAllowedChannel,
  fetchTextChannel,
  assertSendable,
  downloadAttachment,
  safeAttName,
  chunk,
  THREAD_COLD_MS,
  MAX_CHUNK_LIMIT,
  MAX_ATTACHMENT_BYTES,
  PERMISSION_REPLY_RE,
}
