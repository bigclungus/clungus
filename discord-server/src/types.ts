import type { Client } from 'discord.js'
import type { NotificationEmitter } from './notifications.js'
import type { AccessModule } from './access.js'

/**
 * MCP tool definition — matches the shape expected by ListToolsRequestSchema.
 */
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required: string[]
  }
}

/**
 * Result shape returned by tool handlers, matching MCP CallToolResult.
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/**
 * Shared context injected into every tool handler via dependency injection.
 * No module-level globals — tools receive everything they need through this.
 */
export interface ToolContext {
  client: Client
  access: AccessModule
  notifications: NotificationEmitter
  /** DISCORD_INJECT_SECRET for voice receive inject calls. */
  injectSecret: string | undefined
}

/**
 * Tool handler signature — receives parsed args and a context object.
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext,
) => Promise<ToolResult>
