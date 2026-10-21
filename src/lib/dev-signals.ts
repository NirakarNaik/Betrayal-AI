/**
 * Development-only instrumentation for Reticle verification. Lets the verifier
 * check what the arena BELIEVES (phase, round, status) and not just what it
 * rendered. Every call is a no-op in production builds.
 */
type ReticleApi = { signal(name: string, data?: Record<string, unknown>): void; state(name: string, value: unknown): void };

let api: Promise<ReticleApi | null> | null = null;

function load(): Promise<ReticleApi | null> {
  if (process.env.NODE_ENV !== "development") return Promise.resolve(null);
  api ??= import("@reticlehq/react").then((m) => m.reticle as ReticleApi).catch(() => null);
  return api;
}

export function devSignal(name: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  void load().then((r) => r?.signal(name, data));
}

export function devState(name: string, value: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  void load().then((r) => r?.state(name, value));
}

export const DEV_SIGNALS = ["arena:phase", "arena:complete", "human:action", "human:rejected"] as const;
export const DEV_STORES = ["arena"] as const;
