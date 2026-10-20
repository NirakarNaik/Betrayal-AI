"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-rose-300">System fault</p>
      <h1 className="font-display text-2xl font-bold uppercase">Something went wrong</h1>
      <p className="max-w-md text-sm text-ink-dim">{error.message || "An unexpected error occurred."}</p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
