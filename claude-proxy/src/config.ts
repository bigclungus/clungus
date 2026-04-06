import { join } from "node:path";
import type { ProxyConfig } from "./types";

const defaultPath = join(import.meta.dir, "..", "proxy.config.json");

export function getConfigPath(): string {
  return process.env.PROXY_CONFIG ?? defaultPath;
}

export async function loadConfig(): Promise<ProxyConfig> {
  const path = getConfigPath();
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Config not found: ${path}`);
  }
  return (await file.json()) as ProxyConfig;
}
