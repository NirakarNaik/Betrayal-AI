/**
 * Server-side match controller (singleton per Node process).
 *
 * - Owns authoritative sessions and enforces phases via the engine.
 * - A single background loop per match is the ONLY code path that advances
 *   phases, so a round is resolved exactly once. Human inputs are synchronous
 *   engine applications that never advance phases themselves.
 * - Every state change is persisted through a serialized save queue.
 * - Pause: in-flight model calls finish and their results are applied; no new
 *   calls start until resume. Cancel aborts in-flight calls.
 * - Recovery: a running match found in storage without an active loop (e.g.
 *   after a restart) is replayed from its input log and its loop restarted.
 *   Decisions that were in flight are simply requested again.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PERSONALITIES, PERSONALITY_IDS } from "@/agents/personalities";
import { getRuleset, RULESETS } from "@/game/config";
import { pendingPlayers } from "@/game/engine";
import type { MatchSetup } from "@/game/initial-state";
import { randomSeed, normalizeSeed } from "@/game/random";
import type { ActionProposal, MessageInput, PersonalityId } from "@/game/types";
import { buildView, type MatchView, type Viewer } from "@/game/visibility";
import { getLlmConfig, isLiveMode } from "@/llm/env";
import { estimateMatch } from "@/llm/estimate";
import { AnthropicTransport, LlmGateway } from "@/llm/gateway";
import { summarizeUsage, type UsageRecord, type UsageSummary } from "@/llm/usage";
import { createBrains } from "./brains";
import { MatchSession, type AgentMode, type DecisionLogEntry, type SessionStatus } from "./session";
import { createStore, type MatchListItem, type Store } from "./store";
import { aggregateTournament, rotatedLineup, summarizeMatch } from "./tournament-stats";
import type { MatchResultSummary, TournamentConfig, TournamentRecord } from "./tournament-types";

const HUMAN_TIMEOUT_MS = Number(process.env.HUMAN_TURN_TIMEOUT_MS ?? 180_000) || 180_000;
const MAX_LIVE_TOURNAMENT_MATCHES = Number(process.env.TOURNAMENT_MAX_LIVE_MATCHES ?? 10) || 10;
const MAX_DEMO_TOURNAMENT_MATCHES = 100;

const DELAYS = {
  standard: { message: 1600, collected: 700, reveal: 5000, vote: 3500, advance: 600, idle: 1000 },
  accelerated: { message: 250, collected: 150, reveal: 1200, vote: 900, advance: 120, idle: 500 },
} as const;

export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "UserError";
  }
}

interface Entry {
  session: MatchSession;
  loopActive: boolean;
  abort: AbortController;
  wake: (() => void) | null;
  saveChain: Promise<void>;
  thinking: string[];
}

export interface WaitingInfo {
  kind: "human" | "agents" | "resolving" | "reveal" | "paused" | "complete" | "error";
  playerIds: string[];
  humanDeadline: number | null;
}

export interface ArenaPayload {
  view: MatchView;
  status: SessionStatus;
  agentMode: AgentMode;
  speed: "standard" | "accelerated";
  waiting: WaitingInfo;
  usage: UsageSummary;
  decisions: DecisionLogEntry[];
  storeKind: string;
  error: string | null;
  serverTime: number;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Controller {
  readonly store: Store;
  readonly gateway: LlmGateway | null;
  private entries = new Map<string, Entry>();
  private tournamentsRunning = new Map<string, AbortController>();
  private ready: Promise<void>;

  constructor() {
    this.store = createStore();
    const cfg = getLlmConfig();
    this.gateway = isLiveMode(cfg) ? new LlmGateway(new AnthropicTransport(), cfg) : null;
    if (this.gateway) {
      this.gateway.onUsage((rec) => {
        this.store.appendUsage([rec]).catch((e) => console.error("[controller] usage persist failed", e));
      });
    }
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    if (!this.gateway) return;
    try {
      const totals = await this.store.usageTotals();
      this.gateway.budget.seed(totals.global, totals.perMatch);
    } catch (e) {
      console.error("[controller] failed to seed budget from storage", e);
    }
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  async status() {
    await this.ready;
    const cfg = getLlmConfig();
    return {
      liveMode: Boolean(this.gateway),
      apiKeyPresent: cfg.apiKeyPresent,
      agentModeSetting: cfg.agentMode,
      models: this.gateway ? { cheap: cfg.modelCheap, strategic: cfg.modelStrategic } : null,
      budget: this.gateway ? this.gateway.budget.status() : null,
      store: this.store.kind,
      rulesets: Object.values(RULESETS).map((r) => ({ id: r.id, name: r.name, description: r.description, maxRounds: r.maxRounds })),
      estimates: Object.fromEntries(
        Object.keys(RULESETS).map((id) => [id, { spectator: estimateMatch(id, 5, cfg), human: estimateMatch(id, 4, cfg) }]),
      ),
      humanTimeoutMs: HUMAN_TIMEOUT_MS,
      tournamentLimits: { live: MAX_LIVE_TOURNAMENT_MATCHES, demo: MAX_DEMO_TOURNAMENT_MATCHES },
    };
  }

  // -------------------------------------------------------------------------
  // Match lifecycle
  // -------------------------------------------------------------------------

  async createMatch(opts: {
    mode: "spectator" | "human";
    rulesetId: string;
    seed?: number | null;
    speed: "standard" | "accelerated";
    humanName?: string;
    personalities?: PersonalityId[];
  }): Promise<{ matchId: string; humanToken: string | null }> {
    await this.ready;
    if (!RULESETS[opts.rulesetId]) throw new UserError("Unknown ruleset");
    const seed = opts.seed != null && Number.isFinite(opts.seed) ? normalizeSeed(opts.seed) : randomSeed();
    const lineup = opts.personalities?.length === 5 ? opts.personalities : PERSONALITY_IDS;
    const id = newId("m");
    let humanToken: string | null = null;
    let players: MatchSetup["players"];
    if (opts.mode === "human") {
      // The human takes a seed-determined seat; four AI personalities fill the rest.
      const humanSeat = seed % 5;
      const ais = lineup.slice(0, 4);
      players = [];
      let ai = 0;
      for (let seat = 0; seat < 5; seat++) {
        if (seat === humanSeat) {
          const name = (opts.humanName ?? "").trim().slice(0, 24) || "Challenger";
          players.push({ id: `p${seat + 1}`, name, kind: "human", personalityId: null });
        } else {
          const pid = ais[ai++]!;
          players.push({ id: `p${seat + 1}`, name: PERSONALITIES[pid].name, kind: "ai", personalityId: pid });
        }
      }
      humanToken = randomBytes(24).toString("hex");
    } else {
      players = lineup.map((pid, seat) => ({ id: `p${seat + 1}`, name: PERSONALITIES[pid].name, kind: "ai" as const, personalityId: pid }));
    }
    const session = MatchSession.create({
      setup: { id, seed, rulesetId: opts.rulesetId, mode: opts.mode, players, at: Date.now() },
      agentMode: this.gateway ? "live" : "demo",
      speed: opts.speed,
      humanTokenHash: humanToken ? sha256(humanToken) : null,
      tournamentId: null,
      now: Date.now(),
    });
    const entry = this.register(session);
    await this.persist(entry);
    void this.loop(entry);
    return { matchId: id, humanToken };
  }

  private register(session: MatchSession): Entry {
    const entry: Entry = { session, loopActive: false, abort: new AbortController(), wake: null, saveChain: Promise.resolve(), thinking: [] };
    this.entries.set(session.id, entry);
    return entry;
  }

  private persist(entry: Entry): Promise<void> {
    entry.saveChain = entry.saveChain
      .then(() => this.store.saveSession(entry.session.snap, entry.session.state))
      .catch((e) => console.error(`[controller] persist ${entry.session.id} failed`, e));
    return entry.saveChain;
  }

  private async getEntry(id: string): Promise<Entry> {
    await this.ready;
    const existing = this.entries.get(id);
    if (existing) return existing;
    const snap = await this.store.loadSession(id);
    if (!snap) throw new UserError("Match not found", 404);
    const entry = this.register(MatchSession.restore(snap));
    // Recovery: resume interrupted non-tournament matches.
    if (snap.status === "running" && !snap.tournamentId) void this.loop(entry);
    return entry;
  }

  private brainsFor(session: MatchSession) {
    return createBrains(session.state, session.snap.agentMode === "live" && this.gateway ? "live" : "demo", this.gateway, session.snap.tournamentId);
  }

  private humanTimedOut(session: MatchSession, now: number): boolean {
    const humanPending = session.state.players.some((p) => p.kind === "human" && pendingPlayers(session.state).includes(p.id));
    return humanPending && now - session.snap.phaseStartedAt > HUMAN_TIMEOUT_MS;
  }

  private async loop(entry: Entry): Promise<void> {
    if (entry.loopActive) return;
    entry.loopActive = true;
    const session = entry.session;
    const brains = this.brainsFor(session);
    try {
      let guard = 0;
      while (session.snap.status === "running" && guard++ < 5000) {
        const phaseBefore = session.state.phase;
        const pendingAi = session.state.players.filter((p) => p.kind === "ai" && pendingPlayers(session.state).includes(p.id)).map((p) => p.id);
        entry.thinking = phaseBefore === "negotiation" ? pendingAi.slice(0, 1) : pendingAi;
        const outcome = await session.step(brains, {
          now: Date.now,
          signal: entry.abort.signal,
          forceHumanTimeout: this.humanTimedOut(session, Date.now()),
        });
        entry.thinking = [];
        if (outcome.kind !== "waiting_human") await this.persist(entry);
        if (outcome.kind === "complete" || session.state.phase === "complete") break;
        const d = DELAYS[session.snap.speed];
        if (outcome.kind === "waiting_human") {
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, d.idle);
            entry.wake = () => {
              clearTimeout(t);
              resolve();
            };
          });
          entry.wake = null;
          continue;
        }
        const phaseAfter = session.state.phase;
        let delay: number = d.advance;
        if (phaseAfter === "reveal" && phaseBefore !== "reveal") delay = d.reveal;
        else if (phaseBefore === "voting" && phaseAfter !== "voting") delay = d.vote;
        else if (phaseBefore === "negotiation" && phaseAfter === "negotiation") delay = d.message;
        else if (phaseBefore === "commitment" || phaseBefore === "voting") delay = d.collected;
        await sleep(delay);
      }
    } catch (e) {
      console.error(`[controller] match ${session.id} failed`, e);
      session.snap.error = e instanceof Error ? e.message : String(e);
      if (session.state.phase !== "complete") session.apply({ kind: "cancel", reason: "failed", at: Date.now() });
      session.snap.status = "failed";
      await this.persist(entry);
    } finally {
      entry.loopActive = false;
      entry.thinking = [];
      this.gateway?.releaseMatch(session.id);
    }
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  async getArena(id: string, humanToken: string | null, wantOmniscient: boolean): Promise<ArenaPayload> {
    const entry = await this.getEntry(id);
    const s = entry.session;
    const viewerId = this.authenticate(s, humanToken);
    const viewer: Viewer = viewerId ? { kind: "player", playerId: viewerId } : { kind: "spectator" };
    const view = buildView(s.state, viewer, wantOmniscient);
    const pending = pendingPlayers(s.state);
    const humanPending = s.state.players.filter((p) => p.kind === "human" && pending.includes(p.id)).map((p) => p.id);
    let waiting: WaitingInfo;
    if (s.snap.status === "failed") waiting = { kind: "error", playerIds: [], humanDeadline: null };
    else if (s.state.phase === "complete") waiting = { kind: "complete", playerIds: [], humanDeadline: null };
    else if (s.snap.status === "paused") waiting = { kind: "paused", playerIds: [], humanDeadline: null };
    else if (s.state.phase === "reveal" || s.state.phase === "resolution") waiting = { kind: "reveal", playerIds: [], humanDeadline: null };
    else if (entry.thinking.length) waiting = { kind: "agents", playerIds: entry.thinking, humanDeadline: null };
    else if (humanPending.length) waiting = { kind: "human", playerIds: humanPending, humanDeadline: s.snap.phaseStartedAt + HUMAN_TIMEOUT_MS };
    else waiting = { kind: "resolving", playerIds: [], humanDeadline: null };

    const complete = s.state.phase === "complete";
    const decisions = s.snap.decisions
      .filter((d) => view.omniscient || complete || d.playerId === viewerId)
      .map((d) => ({ ...d, summary: d.summary }));
    return {
      view,
      status: s.snap.status,
      agentMode: s.snap.agentMode,
      speed: s.snap.speed,
      waiting,
      usage: summarizeUsage(s.snap.usage),
      decisions: decisions.slice(-60),
      storeKind: this.store.kind,
      error: s.snap.error,
      serverTime: Date.now(),
    };
  }

  private authenticate(session: MatchSession, token: string | null): string | null {
    if (!token || !session.snap.humanTokenHash || !/^[0-9a-f]{48}$/.test(token)) return null;
    if (!safeEqualHex(sha256(token), session.snap.humanTokenHash)) return null;
    return session.state.players.find((p) => p.kind === "human")?.id ?? null;
  }

  async listMatches(limit = 12): Promise<MatchListItem[]> {
    await this.ready;
    return this.store.listMatches(limit);
  }

  // -------------------------------------------------------------------------
  // Human actions (validated by the engine; never trust client state)
  // -------------------------------------------------------------------------

  async humanAction(
    id: string,
    token: string | null,
    action:
      | { type: "message"; message: MessageInput }
      | { type: "end_negotiation" }
      | { type: "respond_offer"; messageId: string; accept: boolean }
      | { type: "commit"; proposal: ActionProposal }
      | { type: "vote"; targetId: string | null },
  ): Promise<void> {
    const entry = await this.getEntry(id);
    const s = entry.session;
    const playerId = this.authenticate(s, token);
    if (!playerId) throw new UserError("Not a participant in this match", 403);
    if (s.snap.status !== "running" && s.snap.status !== "paused") throw new UserError("Match is not active", 409);
    const at = Date.now();
    let res;
    switch (action.type) {
      case "message":
        res = s.apply({ kind: "message", playerId, message: action.message, at });
        break;
      case "end_negotiation":
        res = s.apply({ kind: "end_negotiation", playerId, at });
        break;
      case "respond_offer":
        res = s.apply({ kind: "respond_offer", playerId, messageId: action.messageId, accept: action.accept, at });
        break;
      case "commit":
        res = s.apply({ kind: "commit", playerId, proposal: action.proposal, source: "human", decisionSummary: null, at });
        break;
      case "vote":
        res = s.apply({ kind: "vote", playerId, targetId: action.targetId, at });
        break;
    }
    if (res.events.length) await this.persist(entry);
    entry.wake?.();
    if (!res.ok) throw new UserError(res.error ?? "Action rejected", 422);
  }

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------

  async control(id: string, op: "pause" | "resume" | "cancel" | "speed", speed?: "standard" | "accelerated", token?: string | null): Promise<void> {
    const entry = await this.getEntry(id);
    const s = entry.session;
    // In human matches only the participant may control the match.
    if (s.state.mode === "human" && !this.authenticate(s, token ?? null)) throw new UserError("Only the participant can control this match", 403);
    if (s.snap.tournamentId) throw new UserError("Tournament matches are controlled from the Tournament Lab", 409);
    switch (op) {
      case "pause":
        if (s.snap.status === "running") s.snap.status = "paused";
        break;
      case "resume":
        if (s.snap.status === "paused") {
          s.snap.status = "running";
          s.snap.phaseStartedAt = Date.now();
          void this.loop(entry);
        }
        break;
      case "cancel":
        if (s.snap.status === "running" || s.snap.status === "paused") {
          entry.abort.abort();
          s.apply({ kind: "cancel", reason: "cancelled", at: Date.now() });
          s.snap.status = "cancelled";
        }
        break;
      case "speed":
        if (speed === "standard" || speed === "accelerated") s.snap.speed = speed;
        break;
    }
    entry.wake?.();
    await this.persist(entry);
  }

  /** Recorded inputs for client-side replay scrubbing (no model calls). */
  async getReplay(id: string) {
    const entry = await this.getEntry(id);
    const s = entry.session;
    if (s.state.phase !== "complete") throw new UserError("Replays are available after the match completes", 409);
    return { setup: s.snap.setup, inputs: s.snap.inputs, decisions: s.snap.decisions };
  }

  // -------------------------------------------------------------------------
  // Tournaments
  // -------------------------------------------------------------------------

  async createTournament(input: { name?: string; matchCount: number; seedStart?: number | null; rulesetId: string; personalities?: PersonalityId[]; rotateSeats?: boolean }): Promise<TournamentRecord> {
    await this.ready;
    getRuleset(input.rulesetId);
    const agentMode: AgentMode = this.gateway ? "live" : "demo";
    const max = agentMode === "live" ? MAX_LIVE_TOURNAMENT_MATCHES : MAX_DEMO_TOURNAMENT_MATCHES;
    const matchCount = Math.floor(input.matchCount);
    if (!(matchCount >= 1 && matchCount <= max)) throw new UserError(`Match count must be between 1 and ${max} in ${agentMode} mode`);
    const personalities = input.personalities?.length === 5 && new Set(input.personalities).size === 5 ? input.personalities : PERSONALITY_IDS;
    const cfg = getLlmConfig();
    const est = estimateMatch(input.rulesetId, 5, cfg);
    const estimated = agentMode === "live" ? est.approxCostUsd.high * matchCount : 0;
    if (this.gateway) {
      const b = this.gateway.budget.status();
      if (b.killSwitch) throw new UserError("Global API budget exhausted (kill switch engaged)", 409);
      if (b.globalSpentUsd + estimated > b.globalLimitUsd) {
        throw new UserError(`Estimated cost $${estimated.toFixed(2)} exceeds the remaining global budget ($${(b.globalLimitUsd - b.globalSpentUsd).toFixed(2)})`, 409);
      }
    }
    const config: TournamentConfig = {
      name: (input.name ?? "").trim().slice(0, 60) || `Tournament ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      matchCount,
      seedStart: input.seedStart != null && Number.isFinite(input.seedStart) ? normalizeSeed(input.seedStart) : randomSeed() % 1_000_000,
      rulesetId: input.rulesetId,
      agentMode,
      personalities,
      rotateSeats: input.rotateSeats ?? true,
      concurrency: cfg.tournamentConcurrency,
    };
    const record: TournamentRecord = {
      id: newId("t"),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "running",
      config,
      metadata: {
        modelCheap: agentMode === "live" ? cfg.modelCheap : null,
        modelStrategic: agentMode === "live" ? cfg.modelStrategic : null,
        escalationThreshold: agentMode === "live" ? Number(process.env.ANTHROPIC_ESCALATION_THRESHOLD ?? 3) || 3 : null,
        agentIds: Object.fromEntries(personalities.map((p) => [p, PERSONALITIES[p].agentId])),
        rulesetId: input.rulesetId,
        failurePolicy: "A match that throws is retried once with the same seed; if it fails again it is marked failed and excluded from results.",
      },
      matches: Array.from({ length: matchCount }, (_, i) => ({
        matchId: `${"t"}${i}`,
        seed: normalizeSeed(config.seedStart + i),
        status: "pending" as const,
        attempts: 0,
        terminal: null,
        players: [],
        usage: { calls: 0, costUsd: 0 },
        error: null,
      })),
      estimatedCostUsd: estimated,
      error: null,
    };
    await this.store.saveTournament(record);
    void this.runTournament(record);
    return record;
  }

  private async runTournament(record: TournamentRecord): Promise<void> {
    const abort = new AbortController();
    this.tournamentsRunning.set(record.id, abort);
    let next = 0;
    let saveChain = Promise.resolve();
    const save = () => {
      record.updatedAt = Date.now();
      saveChain = saveChain.then(() => this.store.saveTournament(record)).catch((e) => console.error("[tournament] save failed", e));
      return saveChain;
    };
    const runOne = async (i: number): Promise<MatchResultSummary> => {
      const lineup = rotatedLineup(record.config.personalities, i, record.config.rotateSeats);
      const seed = record.matches[i]!.seed;
      let lastError: string | null = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (abort.signal.aborted) break;
        const id = newId("tm");
        record.matches[i] = { ...record.matches[i]!, matchId: id, status: "running", attempts: attempt };
        await save();
        const session = MatchSession.create({
          setup: {
            id,
            seed,
            rulesetId: record.config.rulesetId,
            mode: "spectator",
            players: lineup.map((pid, seat) => ({ id: `p${seat + 1}`, name: PERSONALITIES[pid].name, kind: "ai" as const, personalityId: pid })),
            at: Date.now(),
          },
          agentMode: record.config.agentMode,
          speed: "accelerated",
          humanTokenHash: null,
          tournamentId: record.id,
          now: Date.now(),
        });
        const entry = this.register(session);
        try {
          await session.runToCompletion(this.brainsFor(session), { now: Date.now, signal: abort.signal });
          if (abort.signal.aborted) {
            session.apply({ kind: "cancel", reason: "cancelled", at: Date.now() });
            session.snap.status = "cancelled";
            await this.persist(entry);
            return summarizeMatch(session.state, session.snap.usage, "cancelled", attempt, null);
          }
          await this.persist(entry);
          return summarizeMatch(session.state, session.snap.usage, "completed", attempt, null);
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          session.snap.error = lastError;
          if (session.state.phase !== "complete") session.apply({ kind: "cancel", reason: "failed", at: Date.now() });
          session.snap.status = "failed";
          await this.persist(entry);
          if (attempt === 2) return summarizeMatch(session.state, session.snap.usage, "failed", attempt, lastError);
        } finally {
          this.gateway?.releaseMatch(id);
          this.entries.delete(id);
        }
      }
      return { ...record.matches[i]!, status: "cancelled", error: lastError };
    };
    const worker = async () => {
      while (!abort.signal.aborted) {
        const i = next++;
        if (i >= record.matches.length) return;
        record.matches[i] = await runOne(i);
        await save();
        if (this.gateway?.budget.status().killSwitch) {
          record.error = "Global budget kill switch engaged; remaining matches cancelled.";
          abort.abort();
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.max(1, record.config.concurrency) }, worker));
      for (const m of record.matches) if (m.status === "pending" || m.status === "running") m.status = "cancelled";
      record.status = abort.signal.aborted ? "cancelled" : "completed";
    } catch (e) {
      record.status = "failed";
      record.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.tournamentsRunning.delete(record.id);
      await save();
    }
  }

  async getTournament(id: string) {
    await this.ready;
    const t = await this.store.loadTournament(id);
    if (!t) throw new UserError("Tournament not found", 404);
    // A "running" record with no active worker was interrupted by a restart.
    if (t.status === "running" && !this.tournamentsRunning.has(id)) {
      t.status = "failed";
      t.error = "Interrupted (server restarted). Completed matches are preserved.";
      for (const m of t.matches) if (m.status === "running" || m.status === "pending") m.status = "cancelled";
      await this.store.saveTournament(t);
    }
    return { record: t, aggregate: aggregateTournament(t.matches, t.config.personalities) };
  }

  async listTournaments() {
    await this.ready;
    const list = await this.store.listTournaments(20);
    return list.map((t) => ({
      id: t.id,
      name: t.config.name,
      status: t.status,
      createdAt: t.createdAt,
      agentMode: t.config.agentMode,
      matchCount: t.config.matchCount,
      completed: t.matches.filter((m) => m.status === "completed").length,
      failed: t.matches.filter((m) => m.status === "failed").length,
    }));
  }

  async cancelTournament(id: string): Promise<void> {
    const a = this.tournamentsRunning.get(id);
    if (!a) throw new UserError("Tournament is not running", 409);
    a.abort();
  }

  /** Usage records (for tests / diagnostics). */
  usageFor(id: string): UsageRecord[] {
    return this.entries.get(id)?.session.snap.usage ?? [];
  }
}

const g = globalThis as unknown as { __afcController?: Controller };

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getController(): Controller {
  if (!g.__afcController) g.__afcController = new Controller();
  return g.__afcController;
}
