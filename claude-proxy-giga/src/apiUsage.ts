/** Deep-merge usage objects from streaming events (later fields override / merge into nested objects). */
export function deepMergeUsage(
  prev: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    prev && typeof prev === "object" && !Array.isArray(prev) ? { ...prev } : {};
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return base;
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const ex = base[k];
      if (
        ex !== null &&
        typeof ex === "object" &&
        !Array.isArray(ex)
      ) {
        base[k] = deepMergeUsage(
          ex as Record<string, unknown>,
          v as Record<string, unknown>,
        );
      } else {
        base[k] = deepMergeUsage({}, v as Record<string, unknown>);
      }
    } else {
      base[k] = v;
    }
  }
  return base;
}

/** All finite numeric leaves, keyed by path with underscores (for metrics / logs). */
export function flattenNumericUsageFields(
  obj: Record<string, unknown>,
  prefix = "",
): Map<string, number> {
  const m = new Map<string, number>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}_${k}` : k;
    if (typeof v === "number" && Number.isFinite(v)) {
      m.set(path, v);
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const inner = flattenNumericUsageFields(v as Record<string, unknown>, path);
      for (const [ik, iv] of inner) {
        m.set(ik, iv);
      }
    }
  }
  return m;
}

export function asUsageRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}
