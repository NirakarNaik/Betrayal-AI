/**
 * Development-only instrumentation for Reticle verification. Lets the verifier
 * check what the arena BELIEVES (phase, round, status) and not just what it
 * rendered. Every call is a no-op in production builds.
 */
type ReticleApi = { signal(name: string, data?: Record<string, unknown>): void };

let api: Promise<ReticleApi | null> | null = null;

// Tiny subscribable stores so Reticle can read and diff app state by name.
const stores = new Map<string, { value: unknown; listeners: Set<() => void> }>();

const enabled = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_RETICLE_ENABLED === "1";

function load(): Promise<ReticleApi | null> {
  if (!enabled) return Promise.resolve(null);
  api ??= Promise.all([import("@reticlehq/react"), import("@reticlehq/browser")])
    .then(([react, browser]) => {
      for (const name of DEV_STORES) {
        const entry = stores.get(name) ?? { value: null, listeners: new Set<() => void>() };
        stores.set(name, entry);
        browser.registerStore(name, {
          getState: () => entry.value,
          subscribe: (l: () => void) => {
            entry.listeners.add(l);
            return () => entry.listeners.delete(l);
          },
        });
      }
      return react.reticle as ReticleApi;
    })
    .catch(() => null);
  return api;
}

export function devSignal(name: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  void load().then((r) => r?.signal(name, data));
}

export function devState(name: (typeof DEV_STORES)[number], value: unknown): void {
  if (!enabled) return;
  const entry = stores.get(name) ?? { value: null, listeners: new Set<() => void>() };
  entry.value = value;
  stores.set(name, entry);
  void load().then(() => entry.listeners.forEach((l) => l()));
}

export const DEV_SIGNALS = ["arena:phase", "arena:complete", "human:action", "human:rejected"] as const;
export const DEV_STORES = ["arena"] as const;
