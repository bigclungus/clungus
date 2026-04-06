import { emitLog } from "./logging";
import type { VictoriaMetricsConfig } from "./types";
import { flattenNumericUsageFields } from "./apiUsage";

function escapePrometheusLabelValue(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function baseUrl(cfg: VictoriaMetricsConfig): string {
  const host = cfg.host.trim();
  const port = cfg.port;
  if (host.startsWith("[")) {
    return `http://${host}:${port}`;
  }
  if (host.includes(":")) {
    return `http://[${host}]:${port}`;
  }
  return `http://${host}:${port}`;
}

/** Safe label value for usage kind (flattened path, e.g. `input_tokens`, `cache_creation_ephemeral_5m_input_tokens`). */
function usageTypeLabel(path: string): string {
  return path.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Log merged API usage as JSON and push each numeric field to VictoriaMetrics (no derived totals).
 */
export function pushUsageMetrics(
  cfg: VictoriaMetricsConfig,
  labels: { model: string; route: "agent" | "default" },
  usage: Record<string, unknown> | null,
): void {
  if (cfg.enabled !== true) return;
  if (!usage || Object.keys(usage).length === 0) return;

  emitLog(`[claude-proxy] recorded usage ${JSON.stringify(usage)}`);

  const flat = flattenNumericUsageFields(usage);
  if (flat.size === 0) return;

  const prefix =
    (cfg.metricPrefix ?? "claude_proxy").replace(/[^a-zA-Z0-9_:]/g, "_") ||
    "claude_proxy";
  const model = escapePrometheusLabelValue(labels.model || "unknown");
  const route = labels.route;
  const ts = Date.now();
  const metricName = `${prefix}_usage_tokens`;

  const lines: string[] = [];
  for (const [path, value] of flat) {
    const typ = escapePrometheusLabelValue(usageTypeLabel(path));
    lines.push(
      `${metricName}{type="${typ}",model="${model}",route="${route}"} ${value} ${ts}`,
    );
  }

  const url = `${baseUrl(cfg)}/api/v1/import/prometheus`;
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: `${lines.join("\n")}\n`,
  }).catch(() => {});
}
