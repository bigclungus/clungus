# Ideal Omni API Design

## Current Architecture

```
Discord → omni-gateway → IPC socket → MCP server → Claude Code
Claude Code → MCP tool → IPC socket → omni-gateway → Discord
```

## What's Missing

The current API is pure transport: receive events, dispatch tool calls. But Claude Code needs **context** and **lifecycle management** that the transport layer already has access to.

---

## 1. Subagent Status

**Add to O2O channel capabilities:**

```json
{
  "channelId": "to_subagent",
  "capabilities": {
    "get_status": {
      "description": "Get the current status of a running subagent",
      "requiresReplyHandle": false,
      "args": {
        "taskId": { "type": "string", "required": true }
      }
      // Returns: { status: "running" | "completed" | "failed" | "unknown", summary?: string }
    },
    "cancel": {
      "description": "Cancel a running subagent",
      "requiresReplyHandle": false,
      "args": {
        "taskId": { "type": "string", "required": true }
      }
    }
  }
}
```

**How it works:** The peer agent keeps output in a known location (`tasks/{taskId}.output`). The gateway proxies HTTP GET to the peer's file read. No new protocol — just a capability that reads a file.

**Why not build on top:** The peer is already reading the file for `subtask-result`. The missing piece is exposing non-result state (running, output so far).

---

## 2. Thread Context Auto-Fetch

**Add to Discord event payload:**

```json
{
  "thread": {
    "id": "1490058966632366205",
    "name": "Clungcord Tauri macOS Plan",
    "parentId": "1485343472952148008",
    "recent": [
      {"id": "...", "author": {"username": "jaboostin"}, "content": "...", "timestamp": "..."},
      ...
    ]
  }
}
```

`recent` = last 10 messages from the thread, fetched by the gateway's `messageCreate` handler before emitting the event. One extra Discord API call.

**Alternative:** Add a `fetch_thread_context(threadId, limit?)` capability to the Discord channel. Current `fetch_history` already exists but this could pre-warm the event.

---

## 3. Reply by Quote (Fallback When Handle Expires)

**Add to Discord channel capabilities:**

```json
{
  "capabilities": {
    "reply": { /* current, requires replyHandle */ },
    "reply_quote": {
      "description": "Reply as a quote to a specific message (uses channelId + messageId, not replyHandle)",
      "requiresReplyHandle": false,
      "args": {
        "text": { "type": "string", "required": true },
        "channelId": { "type": "string", "required": true },
        "messageId": { "type": "string", "required": true }
      }
    }
  }
}
```

Currently `reply` requires a `replyHandle` (which can expire). `reply_quote` resolves the channel + message route directly — same as `reply` but without the handle indirection.

---

## 4. Task Lifecycle Hook

**This is the coordination gap.** Two options:

### Option A: Peer auto-closes tasks on completion

The peer-side agent that creates a task JSON file should also mark it done when the subagent completes. Simple: when `subtask-result` fires, write `status: done` to the task file.

### Option B: Gateway-level task awareness

Add a `task_id` field to O2O messages. When a subagent completes, the gateway writes the task status back. This requires the gateway to know about the task file convention.

**I prefer A** — the peer already has task creation logic, it should own completion too.

---

## 5. Reply Handle TTL Fix / Diagnostics

The reply handles are supposed to last 7 days but they're expiring in seconds. Need:

1. A `list_reply_handles` diagnostic tool (for debugging)
2. Better logging when handles are inserted vs when they're resolved
3. Check if `Math.random()` collisions are the culprit — the `newReplyHandleId()` function should use `crypto.randomUUID()` for the handle ID

---

## Summary of Changes

| Change | Files | Lines | Impact |
|--------|-------|-------|--------|
| Subagent status (O2O) | `packages/channels/o2o/src/gateway-plugin.ts` | ~40 | High — visibility into delegated work |
| Thread context (Discord) | `packages/channels/discord/src/bot.ts` | ~20 | Medium — better thread responses |
| Reply by quote | `packages/channels/discord/src/index.ts` | ~30 | Medium — reliable replies |
| Fix reply handle ID generation | `packages/channels/discord/src/route.ts` | ~5 | Low — collision risk |
| Peer auto-closes tasks | peer-side code | ~10 | High — stops false-positive sweeper noise |

**Total: ~105 lines across 5 files.** That's 20 lines of features saving hundreds of lines of workaround code.
