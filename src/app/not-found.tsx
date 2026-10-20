import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-rose-300">404 · signal lost</p>
      <h1 className="font-display text-3xl font-bold uppercase">Nothing in this sector</h1>
      <Link href="/" className="btn btn-primary">
        Back to the arena
      </Link>
    </main>
  );
}
