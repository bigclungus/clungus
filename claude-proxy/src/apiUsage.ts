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
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return m;
  }
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

/** `null` when `usage` is absent or not a plain object (merge / metrics skip safely). */
export function asUsageRecord(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

const MAX_USAGE_WALK_DEPTH = 48;

/**
 * Coerce every `usage` property in the tree to a plain object when it is null, an array, or a
 * primitive. Fixes clients that do `usage.input_tokens` without guarding (parent was undefined
 * when the key was missing, or throws on null before property access on some runtimes).
 */
export function sanitizeUsageObjectsDeep(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (depth > MAX_USAGE_WALK_DEPTH) return;
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== null && typeof item === "object") {
        sanitizeUsageObjectsDeep(item, depth + 1, seen);
      }
    }
    return;
  }
  const o = value as Record<string, unknown>;
  if (seen.has(o)) return;
  seen.add(o);

  for (const key of Object.keys(o)) {
    const v = o[key];
    if (key === "usage") {
      if (v == null || typeof v !== "object" || Array.isArray(v)) {
        o[key] = {};
      } else {
        sanitizeUsageObjectsDeep(v, depth + 1, seen);
      }
    } else if (v !== null && typeof v === "object") {
      sanitizeUsageObjectsDeep(v, depth + 1, seen);
    }
  }
}
