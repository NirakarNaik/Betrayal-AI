'use client';
import { useEffect } from 'react';
import { DEV_SIGNALS, DEV_STORES } from '@/lib/dev-signals';

/** Dev-only: connect Reticle + install the React adapter, after hydration. */
export function ReticleDev() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    void import('@reticlehq/react').then(
      ({ reticle, install, registerCapabilities }) => {
        install();
        // Both provided by withReticle() in next.config. The bridge rejects a connect with no token;
        // the root makes source paths repo-relative instead of absolute.
        const token = process.env.NEXT_PUBLIC_RETICLE_TOKEN;
        const root = process.env.NEXT_PUBLIC_RETICLE_ROOT;
        // withReticle() finds the daemon serving this project on every dev-server start. It wins over
        // any port written into this file at install time, so moving the daemon needs no edit here.
        const url = process.env.NEXT_PUBLIC_RETICLE_URL;
        // So a version-skewed pair names the SDK's version instead of "an unknown older wire".
        const sdkVersion = process.env.NEXT_PUBLIC_RETICLE_SDK_VERSION;
        reticle.connect({
          projectId: 'agent-fight-club-d5f22706', ...(url ? { url } : {}),
          ...(token ? { token } : {}),
          ...(root ? { root } : {}),
          ...(sdkVersion ? { sdkVersion } : {}),
        });

        // ── Start with ONE flow. ────────────────────────────────────────────────────────────────
        // Registering a store is the highest-value line here: it lets the agent check what the app
        // BELIEVES, not just what it rendered. Pass the STORE, not `() => store.getState()` — the
        // store form wires `subscribe` too, so every mutation emits a diff; the getter form is
        // read-only.
        // No state library detected. If you add one, register it here — see https://docs.reticle.sh/state-management
        registerCapabilities({
          testids: ["agent-card-p1", "agent-card-p2", "agent-card-p3", "agent-card-p4", "agent-card-p5", "action-strike", "action-guard", "action-scout", "action-investigate", "action-sabotage", "action-trade", "action-mediate", "action-recover"],
          signals: [...DEV_SIGNALS],
          stores: [...DEV_STORES],
        });
      },
    );
  }, []);
  return null;
}
