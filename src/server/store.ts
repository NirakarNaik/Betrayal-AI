/**
 * Persistence. The append-only input log (setup + inputs) is the source of
 * truth; full state is always reconstructable by replay. Two backends:
 *  - FileStore (default): JSON files under .data/ — zero configuration.
 *  - SupabaseStore: PostgreSQL via Supabase when SUPABASE_URL and
 *    SUPABASE_SERVICE_ROLE_KEY are set (server-side only; see supabase/migrations).
 * Both use optimistic version checks so a stale writer cannot overwrite newer state.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MatchState } from "@/game/types";
import type { UsageRecord } from "@/llm/usage";
import type { SessionSnapshot, SessionStatus } from "./session";
import type { TournamentRecord } from "./tournament-types";

export interface MatchListItem {
  id: string;
  seed: number;
  mode: "spectator" | "human";
  rulesetId: string;
  status: SessionStatus;
  agentMode: "live" | "demo";
  round: number;
  createdAt: number;
  updatedAt: number;
  winnerName: string | null;
  reason: string | null;
  tournamentId: string | null;
  players: { id: string; name: string; personalityId: string | null; kind: string }[];
}

export class VersionConflictError extends Error {
  constructor(id: string) {
    super(`Version conflict saving ${id}`);
    this.name = "VersionConflictError";
  }
}

export interface Store {
  readonly kind: "file" | "supabase";
  saveSession(snap: SessionSnapshot, state: MatchState): Promise<void>;
  loadSession(id: string): Promise<SessionSnapshot | null>;
  listMatches(limit: number, opts?: { includeTournament?: boolean }): Promise<MatchListItem[]>;
  appendUsage(records: UsageRecord[]): Promise<void>;
  usageTotals(): Promise<{ global: number; perMatch: Record<string, number> }>;
  saveTournament(t: TournamentRecord): Promise<void>;
  loadTournament(id: string): Promise<TournamentRecord | null>;
  listTournaments(limit: number): Promise<TournamentRecord[]>;
}

export function listItem(snap: SessionSnapshot, state: MatchState): MatchListItem {
  const winner = state.terminal?.winnerId ? state.players.find((p) => p.id === state.terminal!.winnerId) : null;
  return {
    id: snap.id,
    seed: state.seed,
    mode: state.mode,
    rulesetId: state.rulesetId,
    status: snap.status,
    agentMode: snap.agentMode,
    round: state.round,
    createdAt: snap.createdAt,
    updatedAt: snap.updatedAt,
    winnerName: winner?.name ?? null,
    reason: state.terminal?.reason ?? null,
    tournamentId: snap.tournamentId,
    players: state.players.map((p) => ({ id: p.id, name: p.name, personalityId: p.personalityId, kind: p.kind })),
  };
}

// ---------------------------------------------------------------------------
// File store
// ---------------------------------------------------------------------------

const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/;

async function atomicWrite(file: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, file);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export class FileStore implements Store {
  readonly kind = "file" as const;
  constructor(private root: string = path.join(process.cwd(), ".data")) {}

  private matchFile(id: string) {
    if (!SAFE_ID.test(id)) throw new Error("Invalid id");
    return path.join(this.root, "matches", `${id}.json`);
  }
  private tournamentFile(id: string) {
    if (!SAFE_ID.test(id)) throw new Error("Invalid id");
    return path.join(this.root, "tournaments", `${id}.json`);
  }
  private indexFile() {
    return path.join(this.root, "match-index.json");
  }

  async saveSession(snap: SessionSnapshot, state: MatchState): Promise<void> {
    const file = this.matchFile(snap.id);
    const existing = await readJson<SessionSnapshot>(file);
    if (existing && existing.version !== snap.version) throw new VersionConflictError(snap.id);
    const next = { ...snap, version: snap.version + 1 };
    await atomicWrite(file, JSON.stringify(next));
    snap.version = next.version;
    const index = (await readJson<Record<string, MatchListItem>>(this.indexFile())) ?? {};
    index[snap.id] = listItem(snap, state);
    await atomicWrite(this.indexFile(), JSON.stringify(index));
  }

  async loadSession(id: string): Promise<SessionSnapshot | null> {
    if (!SAFE_ID.test(id)) return null;
    return readJson<SessionSnapshot>(this.matchFile(id));
  }

  async listMatches(limit: number, opts: { includeTournament?: boolean } = {}): Promise<MatchListItem[]> {
    const index = (await readJson<Record<string, MatchListItem>>(this.indexFile())) ?? {};
    return Object.values(index)
      .filter((m) => opts.includeTournament || !m.tournamentId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async appendUsage(records: UsageRecord[]): Promise<void> {
    if (!records.length) return;
    await fs.mkdir(this.root, { recursive: true });
    await fs.appendFile(path.join(this.root, "usage.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  }

  async usageTotals(): Promise<{ global: number; perMatch: Record<string, number> }> {
    let raw = "";
    try {
      raw = await fs.readFile(path.join(this.root, "usage.jsonl"), "utf8");
    } catch {
      return { global: 0, perMatch: {} };
    }
    let global = 0;
    const perMatch: Record<string, number> = {};
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as UsageRecord;
        global += r.estimatedCostUsd;
        if (r.matchId) perMatch[r.matchId] = (perMatch[r.matchId] ?? 0) + r.estimatedCostUsd;
      } catch {
        /* skip corrupt line */
      }
    }
    return { global, perMatch };
  }

  async saveTournament(t: TournamentRecord): Promise<void> {
    await atomicWrite(this.tournamentFile(t.id), JSON.stringify(t));
  }

  async loadTournament(id: string): Promise<TournamentRecord | null> {
    if (!SAFE_ID.test(id)) return null;
    return readJson<TournamentRecord>(this.tournamentFile(id));
  }

  async listTournaments(limit: number): Promise<TournamentRecord[]> {
    const dir = path.join(this.root, "tournaments");
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const all = await Promise.all(files.map((f) => readJson<TournamentRecord>(path.join(dir, f))));
    return all
      .filter((t): t is TournamentRecord => Boolean(t))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

// ---------------------------------------------------------------------------
// Supabase store
// ---------------------------------------------------------------------------

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;
  /** Highest input/event seq already persisted per match (avoids re-sending rows). */
  private persistedInputs = new Map<string, number>();
  private persistedEvents = new Map<string, number>();

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
    if (res.error) throw new Error(`Supabase ${what} failed: ${res.error.message}`);
    return res.data;
  }

  async saveSession(snap: SessionSnapshot, state: MatchState): Promise<void> {
    const item = listItem(snap, state);
    const row = {
      id: snap.id,
      seed: state.seed,
      ruleset_id: state.rulesetId,
      mode: state.mode,
      status: snap.status,
      agent_mode: snap.agentMode,
      round: state.round,
      phase: state.phase,
      winner_id: state.terminal?.winnerId ?? null,
      terminal: state.terminal,
      tournament_id: snap.tournamentId,
      setup: snap.setup,
      server_meta: {
        speed: snap.speed,
        decisions: snap.decisions,
        error: snap.error,
        phaseStartedAt: snap.phaseStartedAt,
        humanTokenHash: snap.humanTokenHash,
      },
      list_item: item,
      created_at: new Date(snap.createdAt).toISOString(),
      updated_at: new Date(snap.updatedAt).toISOString(),
      version: snap.version + 1,
    };
    if (snap.version === 0) {
      const existing = this.check(await this.db.from("matches").select("version").eq("id", snap.id).maybeSingle(), "select match");
      if (existing) throw new VersionConflictError(snap.id);
      this.check(await this.db.from("matches").insert(row), "insert match");
      this.check(
        await this.db.from("match_players").insert(
          state.players.map((p) => ({ match_id: snap.id, player_id: p.id, name: p.name, kind: p.kind, personality_id: p.personalityId, seat: p.seat })),
        ),
        "insert players",
      );
    } else {
      const updated = this.check(
        await this.db.from("matches").update(row).eq("id", snap.id).eq("version", snap.version).select("id"),
        "update match",
      );
      if (!updated || (updated as unknown[]).length === 0) throw new VersionConflictError(snap.id);
    }
    snap.version += 1;

    const fromInput = this.persistedInputs.get(snap.id) ?? 0;
    const inputs = snap.inputs.slice(fromInput).map((input, i) => ({ match_id: snap.id, seq: fromInput + i, input }));
    if (inputs.length) {
      this.check(await this.db.from("match_inputs").upsert(inputs, { onConflict: "match_id,seq", ignoreDuplicates: true }), "insert inputs");
      this.persistedInputs.set(snap.id, snap.inputs.length);
    }
    const fromEvent = this.persistedEvents.get(snap.id) ?? 0;
    const events = state.events.slice(fromEvent).map((e) => ({
      match_id: snap.id,
      seq: e.seq,
      event_id: e.id,
      type: e.type,
      round: e.round,
      phase: e.phase,
      visibility: e.visibility,
      summary: e.summary,
      data: e.data,
      at: new Date(e.at).toISOString(),
    }));
    if (events.length) {
      this.check(await this.db.from("game_events").upsert(events, { onConflict: "match_id,seq", ignoreDuplicates: true }), "insert events");
      this.persistedEvents.set(snap.id, state.events.length);
    }
    const actions = state.actionHistory.map((a) => ({
      match_id: snap.id,
      round: a.round,
      player_id: a.playerId,
      proposal: a.proposal,
      source: a.source,
      decision_summary: a.decisionSummary,
    }));
    if (actions.length) {
      this.check(await this.db.from("committed_actions").upsert(actions, { onConflict: "match_id,round,player_id", ignoreDuplicates: true }), "insert actions");
    }
    this.check(
      await this.db.from("player_private_state").upsert(
        state.players.map((p) => ({ match_id: snap.id, player_id: p.id, objective: p.objective, clues: p.clues })),
        { onConflict: "match_id,player_id" },
      ),
      "upsert private state",
    );
    const memories = Object.entries(snap.memories).map(([playerId, memory]) => ({ match_id: snap.id, player_id: playerId, memory }));
    if (memories.length) {
      this.check(await this.db.from("agent_memories").upsert(memories, { onConflict: "match_id,player_id" }), "upsert memories");
    }
  }

  async loadSession(id: string): Promise<SessionSnapshot | null> {
    const m = this.check(await this.db.from("matches").select("*").eq("id", id).maybeSingle(), "load match") as Record<string, unknown> | null;
    if (!m) return null;
    const inputs = this.check(await this.db.from("match_inputs").select("seq,input").eq("match_id", id).order("seq"), "load inputs") as { seq: number; input: SessionSnapshot["inputs"][number] }[];
    const mems = this.check(await this.db.from("agent_memories").select("player_id,memory").eq("match_id", id), "load memories") as { player_id: string; memory: SessionSnapshot["memories"][string] }[];
    const usage = this.check(await this.db.from("api_usage").select("record").eq("match_id", id), "load usage") as { record: UsageRecord }[];
    const meta = m.server_meta as Record<string, unknown>;
    this.persistedInputs.set(id, inputs.length);
    const evRes = await this.db.from("game_events").select("seq", { count: "exact", head: true }).eq("match_id", id);
    if (evRes.error) throw new Error(`Supabase count events failed: ${evRes.error.message}`);
    this.persistedEvents.set(id, evRes.count ?? 0);
    return {
      id,
      setup: m.setup as SessionSnapshot["setup"],
      inputs: inputs.map((r) => r.input),
      status: m.status as SessionStatus,
      agentMode: m.agent_mode as "live" | "demo",
      speed: (meta.speed as "standard" | "accelerated") ?? "standard",
      memories: Object.fromEntries(mems.map((r) => [r.player_id, r.memory])),
      decisions: (meta.decisions as SessionSnapshot["decisions"]) ?? [],
      usage: usage.map((u) => u.record),
      humanTokenHash: (meta.humanTokenHash as string | null) ?? null,
      tournamentId: (m.tournament_id as string | null) ?? null,
      error: (meta.error as string | null) ?? null,
      createdAt: Date.parse(m.created_at as string),
      updatedAt: Date.parse(m.updated_at as string),
      phaseStartedAt: (meta.phaseStartedAt as number) ?? Date.now(),
      version: m.version as number,
    };
  }

  async listMatches(limit: number, opts: { includeTournament?: boolean } = {}): Promise<MatchListItem[]> {
    let q = this.db.from("matches").select("list_item").order("created_at", { ascending: false }).limit(limit);
    if (!opts.includeTournament) q = q.is("tournament_id", null);
    const rows = this.check(await q, "list matches") as { list_item: MatchListItem }[];
    return rows.map((r) => r.list_item);
  }

  async appendUsage(records: UsageRecord[]): Promise<void> {
    if (!records.length) return;
    this.check(
      await this.db.from("api_usage").upsert(
        records.map((r) => ({
          id: r.id,
          match_id: r.matchId,
          tournament_id: r.tournamentId,
          player_id: r.playerId,
          model: r.model,
          purpose: r.purpose,
          input_tokens: r.inputTokens,
          output_tokens: r.outputTokens,
          cache_read_tokens: r.cacheReadTokens,
          cache_creation_tokens: r.cacheCreationTokens,
          duration_ms: r.durationMs,
          estimated_cost_usd: r.estimatedCostUsd,
          outcome: r.outcome,
          record: r,
          created_at: new Date(r.at).toISOString(),
        })),
        { onConflict: "id", ignoreDuplicates: true },
      ),
      "insert usage",
    );
  }

  async usageTotals(): Promise<{ global: number; perMatch: Record<string, number> }> {
    const rows = this.check(await this.db.from("api_usage").select("match_id,estimated_cost_usd"), "usage totals") as { match_id: string | null; estimated_cost_usd: number }[];
    let global = 0;
    const perMatch: Record<string, number> = {};
    for (const r of rows) {
      global += Number(r.estimated_cost_usd);
      if (r.match_id) perMatch[r.match_id] = (perMatch[r.match_id] ?? 0) + Number(r.estimated_cost_usd);
    }
    return { global, perMatch };
  }

  async saveTournament(t: TournamentRecord): Promise<void> {
    this.check(
      await this.db.from("tournaments").upsert({ id: t.id, status: t.status, config: t.config, record: t, created_at: new Date(t.createdAt).toISOString(), updated_at: new Date().toISOString() }),
      "save tournament",
    );
    const results = t.matches
      .filter((m) => m.status === "completed" || m.status === "failed" || m.status === "cancelled")
      .map((m) => ({ tournament_id: t.id, match_id: m.matchId, status: m.status, summary: m }));
    if (results.length) {
      this.check(await this.db.from("tournament_results").upsert(results, { onConflict: "tournament_id,match_id" }), "save tournament results");
    }
  }

  async loadTournament(id: string): Promise<TournamentRecord | null> {
    const row = this.check(await this.db.from("tournaments").select("record").eq("id", id).maybeSingle(), "load tournament") as { record: TournamentRecord } | null;
    return row?.record ?? null;
  }

  async listTournaments(limit: number): Promise<TournamentRecord[]> {
    const rows = this.check(await this.db.from("tournaments").select("record").order("created_at", { ascending: false }).limit(limit), "list tournaments") as { record: TournamentRecord }[];
    return rows.map((r) => r.record);
  }
}

export function createStore(): Store {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return new SupabaseStore(url, key);
  return new FileStore(process.env.AFC_DATA_DIR || undefined);
}
