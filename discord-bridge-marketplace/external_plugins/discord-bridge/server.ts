#!/usr/bin/env bun
// Shim: delegate to the actual bridge MCP server
// This file exists so the plugin system can invoke it from the install cache.
import('/home/clungus/work/discord-bridge/mcp-bridge.ts')
