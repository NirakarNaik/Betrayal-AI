# Betrayal Protocol — Rules Reference

All numbers live in [`src/game/config.ts`](../src/game/config.ts). This document describes the
`standard-v1` ruleset; `blitz-v1` is identical except for 4 rounds with votes after rounds 2 and 4.

## Setup

| | Value |
|---|---|
| Players | 5 (spectator: 5 AI · human mode: 1 human + 4 AI) |
| Rounds | 6 |
| Start | 3 health · 10 credits · 2 intel · 1 influence |
| Caps | 3 health · 20 credits · 5 intel · 3 influence |
| Secret objectives | 1 per player, assigned with the seeded PRNG, never changed |

## Round structure

1. **Negotiation.** Each living player may send up to **2 messages** (max 280 characters).
   A message is public, or private to exactly one living player. A private message is an **offer**
   when it carries credits (0–5, escrowed immediately) and/or proposes a **non-aggression pact**.
   - Offers must be answered by the recipient before they commit their action. Accepting delivers the
     escrowed credits (any excess over the cap is returned to the sender) and forms the pact.
     Declining refunds the sender.
   - Unanswered offers **expire at the end of the commitment phase** and are refunded before resolution.
   - Message text is never binding. Only the escrowed credits are.
   - Human players can negotiate at any time during this phase. AI agents speak in turn. The speaking order rotates each round.
2. **Secret commitment.** Every living player locks exactly one action. Commitments are hidden; only
   "has committed" is public. A committed action cannot be changed and duplicate commits are rejected.
3. **Resolution.** This step is deterministic and runs in the order shown below.
4. **Reveal.** All actions and their effects are published. Investigation clues are private.
5. **Voting** (after rounds 2, 4, 6). Sealed simultaneous votes (any living player, including self, or
   abstain). A **strict majority of living players** eliminates the leader. Ties or no majority → no elimination.

## Actions

| Action | Cost | Effect |
|---|---|---|
| STRIKE | 3 credits | 1 damage to a target (not self) |
| GUARD | 1 credit | Absorbs the **first** point of damage this round. Further strikes land normally. |
| SCOUT | 1 credit | +1 intel (cap 5) |
| INVESTIGATE | 2 intel | Private clue about the target's objective: 1st → category, 2nd → exact objective, 3rd+ → progress status |
| SABOTAGE | 2 credits | Target loses `min(2, their credits)` |
| TRADE | the amount | Gives N ≥ 1 credits to a target; overflow above the cap returns to the sender |
| MEDIATE | 1 influence | Succeeds only with a **verified agreement** this round (an accepted offer or a resolved TRADE between mediator and target, either direction) **and** no strike/sabotage between them. Success: mediator +2 influence, target +1 (caps apply). Failure: the influence is spent. |
| RECOVER | free | +2 credits (cap 20) |

## Resolution order

0. **Reveal** every committed action.
1. **Costs**: seat order, checked against resources at the start of resolution. An unaffordable action,
   or one whose target is no longer active, **fizzles**: no cost and no effect.
2. **Defense**: guards activate.
3. **Intel**: scout, investigate.
4. **Economy**: sabotage drains first; then RECOVER and TRADE inflows. Inflows never fund outflows
   in the same round, since every outflow was paid in step 1. Two players trading with each other both resolve.
5. **Combat**: all strikes land simultaneously. Per target, attackers are processed in seat order
   (this only decides which strike a guard absorbs). Attackers who die this round still deal damage.
6. **Diplomacy**: mediation.
7. **Pacts**: a strike or sabotage against an active pact partner breaks the pact (`PACT_BROKEN`, public).
8. **Eliminations**: everyone at 0 health is eliminated simultaneously.

A pact formed in round *r* is active through the end of round *r + 1*, including that round's vote.
Voting against an active pact partner also breaks it. A pact that expires unbroken is "honored".

## Termination

- One player left → `last_player_standing`.
- Zero players left (simultaneous elimination) → `mutual_destruction`, ranked by the tie-breaks below.
- Final round complete with several survivors → `final_round_complete`.
- Admin cancellation / failure → `cancelled` / `failed` (never counted as a completed result).

## Ranking and points

1. Survival status. Survivors first. Eliminated players are ordered by elimination round, later ranking higher.
2. **Protocol Score** = 4 (objective completed) + influence + health + ⌊credits / 3⌋.
3. Credits. 4. Health. 5. Deterministic tie-break: lower FNV-1a hash of `"{seed}:{playerId}"`.

Placement points: 5 / 3 / 2 / 1 / 0.

## Secret objectives

| Objective | Category | Completion predicate (evaluated by code) |
|---|---|---|
| Hoarder | economic | Survive with credits ≥ every other survivor |
| Pacifist | survival | Survive and never resolve a STRIKE (blocked strikes count) |
| Dealmaker | economic | ≥ 2 completed credit transfers (accepted offers or TRADE), as giver or receiver |
| Nemesis | combat | Assigned rival is eliminated, and you damaged them or voted in the vote that removed them |
| Survivor | survival | Be alive when the match ends |
| Iron Wall | survival | Survive at full health |
| Clean Hands | social | Survive, cast ≥ 1 vote, and every vote you cast targeted a player eliminated by the end |
| Spymaster | intel | Successfully investigate ≥ 2 different players |
| Influencer | social | Finish with ≥ 2 influence |

## Information policy

| Information | Who sees it |
|---|---|
| Resources, health, alive status | Everyone |
| Public messages | Everyone |
| Private messages, offers, pacts | The two parties |
| Secret objective, clues | Owner only, revealed to everyone at match end |
| Committed actions | Nobody until resolution, then public |
| Votes | Sealed until the vote resolves, then public |
| Agent self-reported reasoning | Director's view (all-AI matches only) or after the match |

Filtering happens on the server in [`src/game/visibility.ts`](../src/game/visibility.ts). Spectators of a
human match are never omniscient.

## Human turn timer

Each phase allows the human `HUMAN_TURN_TIMEOUT_MS` (default 180 s). When it runs out, the documented defaults
apply: negotiation ends, the commitment becomes RECOVER (recorded as a fallback), and the vote is an abstention.

## Pause semantics

Pausing lets in-flight model calls finish and applies their results, but starts no new decisions.
Resuming restarts the turn timer for the current phase.

## Metric definitions (Tournament Lab)

- **Betrayal**: a `PACT_BROKEN` event caused by this agent (strike, sabotage or vote against an active pact partner).
- **Alliance success rate**: share of pacts this agent joined that were never broken by either side.
- **Attack frequency**: resolved strikes per round alive.
- **Invalid-action rate**: (engine rejections + fallback actions) per round alive.
- **Win-rate CI**: 95% Wilson score interval. Placement uncertainty is ± one standard error.
- Failed or cancelled matches are excluded from every statistic. A failing match is retried once with the same seed.
