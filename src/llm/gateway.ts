/**
 * LLM gateway: the single choke point for every model request.
 *
 * Responsibilities: budget pre-checks + kill switch, global/per-match
 * concurrency, global requests-per-minute cap, timeouts, bounded retries with
 * exponential backoff + jitter, cancellation, and usage recording from the
 * SDK-reported usage fields.
 *
 * The transport is injectable so tests run with deterministic mocks and never
 * make real API calls.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getLlmConfig, type LlmConfig } from "./env";
import { BudgetExceededError, BudgetGuard, RateWindow, Semaphore } from "./limits";
import { estimateCostUsd, preflightCostUsd, priceFor } from "./pricing";
import type { RequestOutcome, UsageRecord } from "./usage";

export interface TransportRequest {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  effort: "low" | "medium" | "high" | null;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface TransportResponse {
  text: string;
  model: string;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
}

export type TransportErrorKind = "timeout" | "rate_limited" | "server" | "connection" | "client" | "cancelled";

export class TransportError extends Error {
  constructor(
    message: string,
    readonly kind: TransportErrorKind,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "TransportError";
  }
  get retryable(): boolean {
    return this.kind === "timeout" || this.kind === "rate_limited" || this.kind === "server" || this.kind === "connection";
  }
}

export interface ModelTransport {
  send(req: TransportRequest): Promise<TransportResponse>;
}

/** Models that accept output_config.effort (Haiku 4.5 rejects it). */
function supportsEffort(model: string): boolean {
  return !model.startsWith("claude-haiku");
}

export class AnthropicTransport implements ModelTransport {
  private client: Anthropic;
  constructor() {
    // maxRetries: 0 — retries are handled by the gateway so each attempt is recorded.
    this.client = new Anthropic({ maxRetries: 0 });
  }

  async send(req: TransportRequest): Promise<TransportResponse> {
    try {
      const response = await this.client.messages.create(
        {
          model: req.model,
          max_tokens: req.maxTokens,
          // Stable prefix (rules + personality) is marked cacheable. Prefixes below
          // the model's minimum cacheable length are simply not cached.
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: req.user }],
          output_config: {
            format: { type: "json_schema", schema: req.schema },
            ...(req.effort && supportsEffort(req.model) ? { effort: req.effort } : {}),
          },
        },
        { timeout: req.timeoutMs, signal: req.signal },
      );
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return {
        text,
        model: response.model,
        stopReason: response.stop_reason,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof Anthropic.APIUserAbortError) throw new TransportError("Request cancelled", "cancelled");
      if (error instanceof Anthropic.APIConnectionTimeoutError) throw new TransportError("Request timed out", "timeout");
      if (error instanceof Anthropic.APIConnectionError) throw new TransportError("Connection error", "connection");
      if (error instanceof Anthropic.RateLimitError) {
        const ra = Number(error.headers?.get("retry-after"));
        throw new TransportError("Rate limited", "rate_limited", Number.isFinite(ra) ? ra * 1000 : null);
      }
      if (error instanceof Anthropic.APIError) {
        const status = error.status ?? 0;
        if (status === 529 || status >= 500) throw new TransportError(`Server error ${status}`, "server");
        throw new TransportError(`API error ${status}: ${error.message.slice(0, 200)}`, "client");
      }
      throw new TransportError(error instanceof Error ? error.message : "Unknown error", "connection");
    }
  }
}

export interface GatewayRequest {
  matchId: string | null;
  tournamentId: string | null;
  playerId: string | null;
  purpose: UsageRecord["purpose"];
  model: string;
  escalated: boolean;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  effort: "low" | "medium" | "high" | null;
  signal?: AbortSignal;
}

export interface GatewayResult {
  ok: boolean;
  text: string | null;
  stopReason: string | null;
  records: UsageRecord[];
  error: string | null;
  outcome: RequestOutcome;
}

export type UsageSink = (record: UsageRecord) => void;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

let recordCounter = 0;

export class LlmGateway {
  readonly budget: BudgetGuard;
  private global: Semaphore;
  private perMatch = new Map<string, Semaphore>();
  private rate: RateWindow;
  private sinks: UsageSink[] = [];

  constructor(
    private transport: ModelTransport,
    private cfg: LlmConfig = getLlmConfig(),
    private random: () => number = Math.random,
  ) {
    this.budget = new BudgetGuard(cfg.matchBudgetUsd, cfg.globalBudgetUsd);
    this.global = new Semaphore(cfg.globalConcurrency);
    this.rate = new RateWindow(cfg.requestsPerMinute);
  }

  get config(): LlmConfig {
    return this.cfg;
  }

  onUsage(sink: UsageSink): void {
    this.sinks.push(sink);
  }

  private matchSem(matchId: string | null): Semaphore | null {
    if (!matchId) return null;
    let s = this.perMatch.get(matchId);
    if (!s) {
      s = new Semaphore(this.cfg.perMatchConcurrency);
      this.perMatch.set(matchId, s);
    }
    return s;
  }

  releaseMatch(matchId: string): void {
    this.perMatch.delete(matchId);
  }

  private emit(rec: UsageRecord): void {
    for (const s of this.sinks) {
      try {
        s(rec);
      } catch (e) {
        console.error("[gateway] usage sink failed", e);
      }
    }
  }

  private record(req: GatewayRequest, partial: Partial<UsageRecord> & { outcome: RequestOutcome; attempt: number }): UsageRecord {
    recordCounter += 1;
    const rec: UsageRecord = {
      id: `use_${Date.now().toString(36)}_${recordCounter}`,
      matchId: req.matchId,
      tournamentId: req.tournamentId,
      playerId: req.playerId,
      purpose: req.purpose,
      model: req.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      durationMs: 0,
      estimatedCostUsd: 0,
      priceKnown: priceFor(req.model).known,
      escalated: req.escalated,
      error: null,
      at: Date.now(),
      ...partial,
    };
    this.emit(rec);
    return rec;
  }

  async request(req: GatewayRequest): Promise<GatewayResult> {
    const records: UsageRecord[] = [];
    const approxInput = Math.ceil((req.system.length + req.user.length) / 3.5);
    const preflight = preflightCostUsd(req.model, approxInput, req.maxTokens);
    try {
      this.budget.check(req.matchId, preflight);
    } catch (e) {
      if (e instanceof BudgetExceededError) {
        records.push(this.record(req, { outcome: "budget_blocked", attempt: 0, error: e.message }));
        return { ok: false, text: null, stopReason: null, records, error: e.message, outcome: "budget_blocked" };
      }
      throw e;
    }

    const maxAttempts = 1 + this.cfg.maxRetries;
    let lastError = "unknown";
    let lastOutcome: RequestOutcome = "api_error";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let releaseGlobal: (() => void) | null = null;
      let releaseMatch: (() => void) | null = null;
      const started = Date.now();
      try {
        const ms = this.matchSem(req.matchId);
        releaseMatch = ms ? await ms.acquire(req.signal) : null;
        releaseGlobal = await this.global.acquire(req.signal);
        for (let w = this.rate.waitTime(); w > 0; w = this.rate.waitTime()) await sleep(w, req.signal);
        this.rate.record();
        const res = await this.transport.send({
          model: req.model,
          system: req.system,
          user: req.user,
          schema: req.schema,
          maxTokens: req.maxTokens,
          effort: req.effort,
          timeoutMs: this.cfg.requestTimeoutMs,
          signal: req.signal,
        });
        const cost = estimateCostUsd(res.model || req.model, res.usage);
        this.budget.record(req.matchId, cost);
        const outcome: RequestOutcome =
          res.stopReason === "refusal" ? "refusal" : res.stopReason === "max_tokens" ? "max_tokens" : "success";
        records.push(
          this.record(req, {
            model: res.model || req.model,
            ...res.usage,
            durationMs: Date.now() - started,
            estimatedCostUsd: cost,
            outcome,
            attempt,
          }),
        );
        if (outcome !== "success") {
          return { ok: false, text: res.text, stopReason: res.stopReason, records, error: `stop_reason=${res.stopReason}`, outcome };
        }
        return { ok: true, text: res.text, stopReason: res.stopReason, records, error: null, outcome };
      } catch (e) {
        const aborted = (e instanceof DOMException && e.name === "AbortError") || (e instanceof TransportError && e.kind === "cancelled");
        if (aborted) {
          records.push(this.record(req, { outcome: "cancelled", attempt, durationMs: Date.now() - started, error: "cancelled" }));
          return { ok: false, text: null, stopReason: null, records, error: "cancelled", outcome: "cancelled" };
        }
        const te = e instanceof TransportError ? e : new TransportError(e instanceof Error ? e.message : String(e), "connection");
        lastError = te.message;
        lastOutcome = te.kind === "timeout" ? "timeout" : te.kind === "rate_limited" ? "rate_limited" : "api_error";
        records.push(this.record(req, { outcome: lastOutcome, attempt, durationMs: Date.now() - started, error: te.message }));
        if (!te.retryable || attempt === maxAttempts) break;
        const backoff = Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(this.random() * 250);
        const wait = te.retryAfterMs !== null ? Math.min(30_000, Math.max(te.retryAfterMs, backoff)) : backoff;
        try {
          releaseGlobal?.();
          releaseGlobal = null;
          releaseMatch?.();
          releaseMatch = null;
          await sleep(wait, req.signal);
        } catch {
          records.push(this.record(req, { outcome: "cancelled", attempt, error: "cancelled during backoff" }));
          return { ok: false, text: null, stopReason: null, records, error: "cancelled", outcome: "cancelled" };
        }
      } finally {
        releaseGlobal?.();
        releaseMatch?.();
      }
    }
    return { ok: false, text: null, stopReason: null, records, error: lastError, outcome: lastOutcome };
  }
}
