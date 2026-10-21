/**
 * Structural sharing: returns `next`, but reuses references from `prev` for every
 * subtree that is deep-equal. Unchanged parts of a fresh poll keep their identity,
 * so memoized components skip re-rendering.
 */
export function replaceEqualDeep<T>(prev: unknown, next: T): T {
  if (prev === next) return prev as T;
  if (Array.isArray(prev) && Array.isArray(next)) {
    let equal = prev.length === next.length;
    const out = next.map((item, i) => {
      const shared = replaceEqualDeep(prev[i], item);
      if (shared !== prev[i]) equal = false;
      return shared;
    });
    return (equal ? prev : out) as T;
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    let equal = prevKeys.length === nextKeys.length;
    const out: Record<string, unknown> = {};
    for (const k of nextKeys) {
      const shared = replaceEqualDeep(prev[k], next[k]);
      if (shared !== prev[k]) equal = false;
      out[k] = shared;
    }
    return (equal ? prev : out) as T;
  }
  return next;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}
