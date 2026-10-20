/**
 * Concurrency and budget controls for model calls.
 *  - Semaphore: bounded concurrent requests (global and per match).
 *  - RateWindow: global requests-per-minute cap (sliding window).
 *  - BudgetGuard: per-match and global spend limits with a kill switch.
 */

export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly max: number) {}

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (this.active < this.max) {
      this.active += 1;
      return () => this.release();
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        this.queue = this.queue.filter((q) => q !== go);
        reject(new DOMException("Aborted", "AbortError"));
      };
      const go = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      this.queue.push(go);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    this.active += 1;
    return () => this.release();
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }

  get inFlight(): number {
    return this.active;
  }
}

export class RateWindow {
  private stamps: number[] = [];
  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Milliseconds to wait before another request is allowed (0 = go now). */
  waitTime(): number {
    const t = this.now();
    this.stamps = this.stamps.filter((s) => t - s < 60_000);
    if (this.stamps.length < this.perMinute) return 0;
    return 60_000 - (t - this.stamps[0]!);
  }

  record(): void {
    this.stamps.push(this.now());
  }
}

export class BudgetExceededError extends Error {
  constructor(
    message: string,
    readonly scope: "match" | "global",
  ) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

export class BudgetGuard {
  private globalSpent = 0;
  private perMatch = new Map<string, number>();
  private killed = false;

  constructor(
    private matchLimit: number,
    private globalLimit: number,
  ) {}

  configure(matchLimit: number, globalLimit: number): void {
    this.matchLimit = matchLimit;
    this.globalLimit = globalLimit;
  }

  /** Seed spend from persisted usage so restarts don't reset the global budget. */
  seed(globalSpent: number, perMatch: Record<string, number>): void {
    this.globalSpent = globalSpent;
    this.perMatch = new Map(Object.entries(perMatch));
    if (this.globalSpent >= this.globalLimit) this.killed = true;
  }

  /** Throws if sending a request with this pre-flight upper-bound cost would exceed a limit. */
  check(matchId: string | null, preflightUsd: number): void {
    if (this.killed || this.globalSpent >= this.globalLimit) {
      this.killed = true;
      throw new BudgetExceededError("Global API budget exhausted: kill switch engaged", "global");
    }
    if (this.globalSpent + preflightUsd > this.globalLimit) {
      throw new BudgetExceededError("Request would exceed the global API budget", "global");
    }
    if (matchId) {
      const spent = this.perMatch.get(matchId) ?? 0;
      if (spent + preflightUsd > this.matchLimit) {
        throw new BudgetExceededError("Request would exceed this match's API budget", "match");
      }
    }
  }

  record(matchId: string | null, usd: number): void {
    this.globalSpent += usd;
    if (matchId) this.perMatch.set(matchId, (this.perMatch.get(matchId) ?? 0) + usd);
    if (this.globalSpent >= this.globalLimit) this.killed = true;
  }

  status(matchId?: string) {
    return {
      globalSpentUsd: this.globalSpent,
      globalLimitUsd: this.globalLimit,
      matchSpentUsd: matchId ? (this.perMatch.get(matchId) ?? 0) : 0,
      matchLimitUsd: this.matchLimit,
      killSwitch: this.killed,
    };
  }
}
