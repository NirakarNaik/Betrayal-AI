/**
 * Replay: rebuild a match from its setup and the recorded input log.
 * No model calls are made; inputs already contain the committed actions, and
 * all randomness derives from the recorded seed via the PRNG state.
 */
import { applyInput } from "./engine";
import { createInitialState, type MatchSetup } from "./initial-state";
import type { EngineInput, GameEvent, MatchState } from "./types";

export interface RecordedMatch {
  setup: MatchSetup;
  inputs: EngineInput[];
}

export interface ReplayFrame {
  inputIndex: number;
  state: MatchState;
  events: GameEvent[];
}

export function replayMatch(rec: RecordedMatch): MatchState {
  let { state } = createInitialState(rec.setup);
  for (const input of rec.inputs) {
    state = applyInput(state, input).state;
  }
  return state;
}

/** Produce per-input frames for scrubbing through a replay. */
export function replayFrames(rec: RecordedMatch): ReplayFrame[] {
  const init = createInitialState(rec.setup);
  const frames: ReplayFrame[] = [{ inputIndex: -1, state: init.state, events: init.events }];
  let state = init.state;
  rec.inputs.forEach((input, i) => {
    const r = applyInput(state, input);
    state = r.state;
    frames.push({ inputIndex: i, state, events: r.events });
  });
  return frames;
}

/** Strip logical timestamps for deterministic comparison of event logs. */
export function eventFingerprint(events: GameEvent[]): string {
  return JSON.stringify(events.map((e) => [e.seq, e.type, e.round, e.phase, e.summary, e.data, e.visibility]));
}
