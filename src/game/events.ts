import type { GameEvent, GameEventType, MatchState, PlayerId, Visibility } from "./types";

export const PUBLIC: Visibility = { scope: "public" };
export const SERVER: Visibility = { scope: "server" };
export const privateTo = (...playerIds: PlayerId[]): Visibility => ({
  scope: "private",
  playerIds: Array.from(new Set(playerIds)),
});

export function makeId(state: MatchState, prefix: string): string {
  const id = `${prefix}_${state.nextId.toString(36)}`;
  state.nextId += 1;
  return id;
}

/**
 * Append an event to the (mutable, already-cloned) state. Event sequence numbers
 * are dense and monotonic, so duplicate creation is detectable by seq.
 */
export function emit(
  state: MatchState,
  out: GameEvent[],
  type: GameEventType,
  at: number,
  visibility: Visibility,
  summary: string,
  data: Record<string, unknown> = {},
): GameEvent {
  const event: GameEvent = {
    id: makeId(state, "ev"),
    seq: state.events.length,
    type,
    round: state.round,
    phase: state.phase,
    at,
    visibility,
    summary,
    data,
  };
  state.events.push(event);
  out.push(event);
  return event;
}

export function canSee(event: GameEvent, viewerId: PlayerId | null, omniscient: boolean): boolean {
  if (omniscient) return event.visibility.scope !== "server";
  if (event.visibility.scope === "public") return true;
  if (event.visibility.scope === "server") return false;
  return viewerId !== null && event.visibility.playerIds.includes(viewerId);
}
