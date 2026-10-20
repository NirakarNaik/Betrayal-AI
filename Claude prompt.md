# BUILD AGENT FIGHT CLUB — BETRAYAL PROTOCOL

You are a senior full-stack engineer, game systems designer, AI agent architect, and product designer. Build a working, polished MVP called **Agent Fight Club**, featuring its first game mode: **Betrayal Protocol**.

This is a real, playable, AI-powered social deduction game. It is NOT a static dashboard, a landing-page-only prototype, a collection of hardcoded dialogue, or a fake simulation.

The product must allow users to watch AI agents compete, join a match as a human player, and run tournaments comparing agent strategies.

## 1. FIRST: INSPECT, PLAN, AND EXECUTE

Before writing code:

1. Inspect the existing repository, package manager, installed dependencies, environment files, and current implementation.
2. If the repository already contains a project, preserve working code and integrate into its architecture instead of blindly replacing everything.
3. If it is empty, scaffold the application using the stack specified below.
4. Create a concise implementation checklist and a proposed file structure.
5. Implement the application in working phases. Do not stop after generating a plan.
6. Run type checking, linting, tests, and a production build as appropriate.
7. Fix errors introduced by your implementation.
8. Explain what is implemented, what works, which environment variables are needed, and what still requires manual configuration.

Do not claim a feature works unless you have implemented and tested it.

If an external credential is missing, implement the integration cleanly, explain how to configure it, and use an explicitly labelled local demo mode where appropriate. Never fabricate successful API calls.

## 2. PRODUCT IDENTITY

Product name: Agent Fight Club  
Game mode: Betrayal Protocol  
Visual identity: Dark, premium, neon cyberpunk, competitive esports arena.

The experience should feel like a futuristic underground AI competition, not a generic admin dashboard.

Visual direction:
- Near-black backgrounds with deep purple and navy surfaces.
- Neon violet, electric cyan, and restrained danger-red accents.
- Clear typography, sharp contrast, subtle borders, atmospheric gradients.
- Distinct, expressive agent avatars.
- Animated resource changes, attack impacts, eliminations, votes, and reveals.
- Compact data-rich panels alongside a dramatic central arena.
- Responsive layouts for desktop and mobile.
- Accessible controls, readable text, reduced-motion support, loading states, empty states, and error states.

Use CSS, SVG, and lightweight animation libraries. Do not make an elaborate 3D engine a prerequisite for the MVP.

Avoid generic AI gradients, excessive glow, unnecessary rounded cards, and decorative elements that obscure gameplay.

## 3. REQUIRED TECHNOLOGY STACK

Use:
- Next.js App Router.
- React and TypeScript with strict type checking.
- Tailwind CSS.
- Framer Motion or an equivalent lightweight animation solution.
- Anthropic's official TypeScript SDK for Claude API access.
- PostgreSQL through Supabase when persistence is configured.
- Supabase Realtime or a suitable polling mechanism for live match updates.
- Vitest for game-engine tests.
- Zod or equivalent runtime schema validation.
- A seeded pseudorandom number generator for deterministic game mechanics.

Use current stable, mutually compatible dependency versions. Follow official SDK and framework documentation.

Do not add unnecessary infrastructure or dependencies.

The game engine must run independently of React, Supabase, and the Claude API. It must be possible to execute and test an entire match locally without making any model calls.

## 4. APPLICATION ROUTES

Implement the following screens.

### `/` — Arena home

Create a polished landing page with:
- Agent Fight Club logo and visual identity.
- A concise description of Betrayal Protocol.
- A prominent "Enter the Arena" action.
- Buttons for Spectator Mode, Play as a Human, and Tournament Lab.
- Agent roster previews.
- A recent matches or recent results section when persisted data exists.
- A compact explanation of the rules.
- A clear indication of whether the user is in live API mode or local demo mode.

Do not invent historical matches or real player statistics.

### `/arena/new` — Match setup

Allow users to:
- Start a spectator match with five AI agents.
- Start a human match with one human and four AI agents.
- Choose an available rule configuration.
- Select a match seed or generate one.
- Choose standard or accelerated simulation speed.
- Start the match.

Display the expected number of model decisions and an approximate cost where meaningful. Label cost estimates as estimates.

### `/arena/[matchId]` — Live arena

This is the core product screen.

Include:
- A central arena showing all active competitors.
- Agent name, personality, avatar, health, credits, intel, and influence.
- Current round and phase.
- Round progress indicator.
- Public negotiation feed.
- A distinct private-message indicator for the relevant recipient.
- An event feed containing verified events.
- Action-commitment status without leaking unrevealed actions.
- Round-resolution animations.
- Vote results and elimination announcements.
- A leaderboard and current standings.
- A collapsible rules panel.
- Pause, resume, and playback-speed controls where supported.
- Match completion screen and replay navigation.

The UI must reflect actual server state. Do not generate random dialogue, resource values, scores, or winners in the frontend.

### `/arena/[matchId]` — Human-player interaction

When the human is a participant:
- Display only information that the human is entitled to see.
- Allow the human to send public messages.
- Allow private offers to eligible recipients.
- Present only legal primary actions.
- Allow selection of a target when required.
- Show action costs and resource availability.
- Provide a clear commit/lock action.
- Prevent changing a committed action.
- Display the waiting state while other players act.
- Show results only when the appropriate reveal phase begins.

Validate every action on the server. Never trust client-supplied resources, targets, turn state, or legality.

### `/tournaments` — Tournament Lab

Implement:
- Tournament creation.
- Configurable match count.
- Seed range or reproducible seed generation.
- Personality and model-routing configurations.
- Progress and completion status.
- Aggregate standings.
- Win rate, average placement, survival rate, objective completion, and behavioral statistics.
- Match drill-down and replay.

For the initial MVP, allow a small batch such as 10 matches, then add 100-match runs after resource limits and reliability are tested.

Clearly distinguish completed, failed, cancelled, and in-progress matches. Failed matches must not count as completed results.

## 5. GAME RULES

Implement a documented, configurable ruleset.

Default setup:
- Spectator mode: five AI players.
- Human mode: one human player and four AI players.
- Maximum six rounds.
- Three health per player.
- Ten credits per player.
- Two intel per player.
- One influence per player.
- One secret objective per player.
- Resource caps configurable in one central file.

Each round consists of four phases:

1. NEGOTIATION
2. SECRET COMMITMENT
3. RESOLUTION
4. REVEAL

Negotiation:
- Each active player can send up to two messages per round.
- Support public messages and private offers.
- Offers may contain a credit transfer and an optional message.
- Offers do not automatically become binding contracts.
- Validate that an offered transfer is affordable.
- Define whether offers expire at round end.
- Apply message length and rate limits.
- Do not leak private offers to unrelated players.

Commitment:
- Each active player selects exactly one primary action.
- Actions remain hidden until all active players have committed.
- A committed action cannot be changed.
- An action must be validated against the player's authoritative state.
- Repeated requests must not create duplicate actions.

Resolution:
- Use a fixed, documented resolution order.
- Define simultaneous attack behavior.
- Define shield/guard behavior.
- Define transfer behavior.
- Define action behavior when a target has been eliminated.
- Define what happens if an action becomes unaffordable or invalid.
- Define ties and elimination edge cases.
- Apply state changes through pure, testable game-engine functions.

Reveal:
- Publish the resolved public events.
- Reveal actions according to the information policy.
- Update standings and objective progress.
- Keep secrets private until the correct reveal point.

Implement these actions:

STRIKE
- Cost: 3 credits.
- Deal one damage to a target.
- Cannot target oneself.

GUARD
- Cost: 1 credit.
- Prevent the next point of damage received during the current round.
- Define how multiple incoming attacks interact with one guard.

SCOUT
- Cost: 1 credit.
- Gain one intel, respecting the resource cap.

INVESTIGATE
- Cost: 2 intel.
- Requires a valid target.
- Return a deterministic clue based on hidden game state.
- Store the clue in the investigator's private knowledge.
- Do not give the investigating player arbitrary omniscience.

SABOTAGE
- Cost: 2 credits.
- Reduce a valid target's credits by two, without reducing credits below zero.
- Define the behavior when the target has insufficient credits.

TRADE
- Transfer an explicitly specified amount of credits to another active player.
- Check affordability at resolution.
- Define how conflicting transfers resolve.

MEDIATE
- Cost: 1 influence.
- Implement a deterministic diplomacy-related scoring condition.
- Do not reward a fabricated or unverified agreement.

RECOVER
- Free.
- Gain two credits, respecting the resource cap.

Voting:
- Voting occurs after rounds 2, 4, and 6.
- All active players vote simultaneously.
- A simple majority eliminates the nominated player.
- A tie causes no elimination.
- Self-voting is allowed but offers no special benefit.
- Eliminated players cannot take further actions or votes.
- A player's secret information remains private until match completion unless a rule explicitly reveals it.

Termination:
- If one player remains, that player wins.
- If multiple players survive through the final round, rank players by the documented scoring rules.
- If an edge case produces a tie, use a deterministic tie-break procedure.
- Every terminal state must have a recorded reason.

Create a central `game/config.ts` file so these rules can be tuned without rewriting game logic.

## 6. SECRET OBJECTIVES

Implement a predefined set of objectives with explicit completion predicates.

Examples:
- Finish with the most credits.
- Survive without ever using Strike.
- Successfully complete two trades.
- Eliminate a specified rival.
- Survive until the final round.
- Finish with at least three health.
- Win without ever voting for a player who survives.

Objectives must be feasible for the selected player count and rules.

Assign objectives using the seeded random generator. Store them in private server-side state.

Do not let an LLM invent arbitrary scoring rules or silently change an objective mid-match.

Objective completion must be evaluated by code using recorded game events and state.

## 7. AGENT PERSONALITIES

Implement five agent profiles with different strategic preferences:

THE CHESSMASTER
- Values long-term payoff and survival.
- Evaluates alliances in terms of future advantage.
- Avoids unnecessary early conflict.

THE SNAKE
- Opportunistic and willing to betray.
- Looks for vulnerable targets and exploitable agreements.
- Does not betray automatically every round.

THE POLITICIAN
- Prioritizes influence, negotiation, and coalition formation.
- Prefers to extract value from other players.
- Uses diplomacy when it improves the expected outcome.

THE CHAOS GREMLIN
- Has higher risk tolerance.
- Sometimes chooses unconventional actions.
- Remains constrained by legal moves and sensible game objectives.

THE QUANT
- Focuses on resource efficiency and expected value.
- Conserves resources when appropriate.
- Prefers measurable strategic advantages.

Personality should affect action preferences, negotiation style, risk tolerance, and memory interpretation. It must not determine fixed outcomes.

Each profile needs:
- A concise system prompt.
- Behavioral preferences.
- A risk-tolerance parameter.
- A negotiation style.
- A target-selection preference.
- A memory-update policy.
- A stable agent identifier.
- A short display description.

Do not write scripts that force the Snake to betray, the Quant to win, or any personality to take a specific action every round.

## 8. CLAUDE API INTEGRATION

Use the official Anthropic TypeScript SDK.

Read API credentials only from server-side environment variables.

Required configuration:
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL_CHEAP`
- `ANTHROPIC_MODEL_STRATEGIC`
- `ANTHROPIC_MAX_OUTPUT_TOKENS`
- `ANTHROPIC_MATCH_BUDGET_USD`
- `ANTHROPIC_GLOBAL_BUDGET_USD`

Model IDs must be configurable rather than scattered across source files.

Never expose the API key or private system prompts to the browser.

Implement a centralized model router.

Use the cheaper configured model for routine action decisions and short dialogue. Escalate to the stronger configured model when:
- A player may be eliminated.
- An alliance decision has major consequences.
- A negotiation has multiple plausible strategic outcomes.
- A configured confidence or decision-criticality rule triggers escalation.

Do not ask a second LLM to evaluate every ordinary action.

Record actual usage fields returned by the SDK whenever available:
- Model ID.
- Input tokens.
- Output tokens.
- Cache read tokens.
- Cache creation tokens.
- Request duration.
- Estimated cost using a configurable pricing table.
- Request outcome.

Never assume that a model's token usage or price is constant.

Use the current official pricing documentation as the reference for model rates. Do not hardcode outdated prices.

Add prompt caching for stable prompt prefixes when supported and economical. Avoid sending unnecessary conversation history.

Implement:
- Request timeouts.
- Bounded retries.
- Exponential backoff with jitter for transient failures.
- Rate-limit handling.
- A per-match concurrency limit.
- A global request limit.
- Budget checks before sending expensive calls.
- Cancellation handling.
- A kill switch when configured budget limits are reached.

Avoid unbounded loops and unbounded retries.

## 9. STRUCTURED ACTIONS AND VALIDATION

Every AI action must conform to a validated schema.

Example:

{
  "action": "guard",
  "targetId": null,
  "amount": null,
  "message": null,
  "decisionSummary": "Protecting my health while others may attack."
}

Use a discriminated union or equivalent schema so action-specific fields are validated correctly.

Do not allow arbitrary JavaScript, executable expressions, or code from model output.

For each response:

1. Parse the structured result.
2. Validate the schema.
3. Validate action legality against authoritative state.
4. Validate target eligibility.
5. Validate resources.
6. Reject or repair invalid actions.
7. Retry at most once with a compact validation error when appropriate.
8. Use a deterministic legal fallback if the response remains invalid.
9. Record the fallback event.

A valid schema does not guarantee a legal game action.

Do not let Claude directly mutate game state, eliminate players, grant resources, decide winners, or award tournament points.

The model proposes an action. The deterministic engine decides what happens.

## 10. PRIVATE INFORMATION AND MEMORY

Implement separate state for:
- Public match state.
- Individual agent private state.
- Human private state.
- Spectator-visible state.
- Authoritative event history.

Each agent should receive only:
- Its own objective.
- Its own resources.
- Publicly visible player information.
- Public events.
- Private messages and offers addressed to it.
- Clues it actually obtained.
- Its compact memory and subjective beliefs.

Never send another agent's secret objective or private memory to an agent unless an explicit game mechanic reveals it.

Implement compact structured memory:
- Previous attacks.
- Completed trades.
- Promises and broken promises.
- Observed votes.
- Investigation results.
- Subjective trust estimates.
- Recent strategically relevant events.

Distinguish observed facts from inferred beliefs.

Trust values are subjective and may be wrong. Do not present them as objectively verified facts.

Keep the browser API response filtered by the authenticated player's visibility permissions. Do not rely on CSS or frontend state to conceal secrets.

Implement server-side authorization and suitable database access policies.

## 11. DETERMINISTIC GAME ENGINE

Create a pure game-engine module independent of the LLM.

Recommended files:
- `src/game/types.ts`
- `src/game/config.ts`
- `src/game/initial-state.ts`
- `src/game/legal-actions.ts`
- `src/game/resolve-round.ts`
- `src/game/objectives.ts`
- `src/game/scoring.ts`
- `src/game/random.ts`
- `src/game/events.ts`
- `src/game/replay.ts`

Define explicit types for:
- Match state.
- Player state.
- Agent identity.
- Action proposals.
- Committed actions.
- Legal action results.
- Game events.
- Secret objectives.
- Tournament results.

The engine must:
- Validate actions.
- Resolve simultaneous actions deterministically.
- Apply resource and health changes.
- Handle ties, elimination, and match termination.
- Evaluate objectives.
- Compute final placements.
- Produce an append-only event log.
- Support reproducible replay from recorded inputs.

Use a seeded pseudorandom number generator for game mechanics that require randomness.

Do not call Claude again during replay. Replays must use the original committed actions and recorded random outcomes.

Model-generated decisions may differ across separate runs. The deterministic guarantee applies to the engine given the same initial state, configuration, recorded actions, and recorded random outcomes.

## 12. EVENT LOG AND HONEST PRESENTATION

Every event displayed as a game fact must originate from validated server state or the deterministic engine.

Examples:
- `MESSAGE_SENT`
- `OFFER_SENT`
- `OFFER_ACCEPTED`
- `ACTION_COMMITTED`
- `ACTION_REJECTED`
- `ATTACK_RESOLVED`
- `GUARD_TRIGGERED`
- `RESOURCE_TRANSFERRED`
- `PLAYER_ELIMINATED`
- `VOTE_RESOLVED`
- `OBJECTIVE_COMPLETED`
- `ROUND_COMPLETED`
- `MATCH_COMPLETED`

Include timestamps, round numbers, event IDs, and the minimum data necessary for visibility.

An agent's statement about its intention must be labelled as an agent statement. It must not be treated as proof of an action.

For every outcome:
- Record the actual action.
- Record its validation result.
- Record its resolved effects.
- Record the resulting state transition.

Never fabricate historical match results, win rates, leaderboard entries, or successful API calls.

## 13. SCORING AND TOURNAMENTS

Suggested placement points:
- First: 5
- Second: 3
- Third: 2
- Fourth: 1
- Fifth: 0

Implement consistent tie-breaks:
1. Survival status.
2. Credits.
3. Health.
4. A documented deterministic final tie-break.

Calculate:
- Match win rate.
- Average placement.
- Survival rate.
- Average credits at termination.
- Objective completion rate.
- Average damage dealt and received.
- Attack frequency.
- Betrayal frequency, based on explicitly defined observable events.
- Alliance success rate, using a documented definition.
- Invalid-action rate.
- Average model usage and estimated cost.

Do not claim that a personality is better based on one match.

For fair comparisons:
- Use a configurable set of seeds.
- Run comparable player-count and rule configurations.
- Rotate seat positions.
- Preserve the same rules across the comparison.
- Track sample size.
- Report uncertainty when appropriate.
- Keep model version and personality configuration in tournament metadata.

Do not silently count failed or incomplete matches as losses or completed games.

Tournament workers must have concurrency limits and budget controls. If a match fails, mark it failed or retry it according to a documented policy.

## 14. DATA STORAGE

Use PostgreSQL through Supabase when configured.

Create migrations and appropriate indexes for:
- Matches.
- Players.
- Private player state.
- Committed actions.
- Game events.
- Agent memories.
- Tournaments.
- Tournament results.
- API usage.

Store secret objectives and private state separately from public match data.

Use transactions or equivalent concurrency protection when committing actions and resolving rounds.

Prevent duplicate commits and duplicate event creation.

Implement server-side access control and row-level security where applicable.

The initial version may support anonymous local matches, but design persistence so multiplayer sessions and authentication can be added without rewriting the game engine.

Do not expose service-role keys to the client.

## 15. REALTIME AND GAME ORCHESTRATION

Implement a reliable server-side match controller.

The controller must:
- Own the authoritative match state.
- Enforce the current phase.
- Collect valid commitments.
- Wait for all required participants or a defined timeout.
- Prevent duplicate processing of a round.
- Resolve the round exactly once.
- Persist the resulting events.
- Publish only the information each viewer is entitled to see.
- Resume or recover safely from interrupted processing where feasible.

Use a simple reliable orchestration strategy before adding queues or complex distributed infrastructure.

For long-running tournament batches, use a bounded worker or suitable job runner. Do not assume a normal web request can run indefinitely.

If a user pauses a match, define whether pending calls finish, whether new calls are stopped, and how the state is resumed.

## 16. UI COMPONENTS

Build reusable components:
- `ArenaHeader`
- `AgentCard`
- `AgentRoster`
- `ResourceBar`
- `RoundTimeline`
- `NegotiationFeed`
- `PrivateMessagePanel`
- `ActionSelector`
- `ActionCommitButton`
- `VotePanel`
- `EventFeed`
- `RoundReveal`
- `MatchLeaderboard`
- `MatchSummary`
- `TournamentDashboard`
- `UsageMeter`
- `ErrorBanner`
- `ConnectionStatus`

Every button must perform a real action or be clearly disabled.

Use loading indicators during model decisions. Make it obvious whether the application is waiting for an agent, waiting for a human, resolving a round, or recovering from an error.

Use subtle sound effects only if implemented with a mute option and suitable accessibility behavior. Audio is optional for the MVP.

## 17. TESTING REQUIREMENTS

Write unit tests for:
- Every legal action.
- Every illegal action.
- Insufficient resources.
- Invalid targets.
- Self-targeting restrictions.
- Simultaneous attacks.
- Guard interactions.
- Resource caps.
- Credit transfers.
- Voting ties.
- Eliminated players.
- Secret objective evaluation.
- Match termination.
- Final scoring.
- Seeded reproducibility.
- Duplicate commitments.
- Duplicate round resolution.

Write integration tests for:
- A complete AI-versus-AI match using mocked model responses.
- A human joining and completing a match.
- Invalid Claude output and fallback behavior.
- Model timeout and retry handling.
- API budget exhaustion.
- Private information isolation.
- Replay consistency.
- Tournament aggregation.

Tests must not require real API calls unless explicitly marked as optional integration tests.

Use deterministic mock responses. Do not use the LLM as the test oracle for game rules.

## 18. COST AND BUDGET MANAGEMENT

The available Anthropic API credit is approximately $70 and expires soon. Prioritize building a functioning game efficiently.

Implement:
- Configurable model routing.
- Compact prompts.
- Bounded outputs.
- Usage tracking.
- Per-match and global spending limits.
- Estimated-cost display.
- Budget-exhaustion behavior.
- Cheap model fallback where appropriate.
- Prompt caching where beneficial.
- A simulation mode that does not require API calls.

Do not make an LLM call for:
- Arithmetic.
- Resource deductions.
- Damage calculations.
- Voting counts.
- Tie resolution.
- Score calculation.
- Tournament statistics.
- Simple event formatting.

Do not burn API credit by automatically starting large tournaments.

Build and test the engine first. Connect Claude after the game rules pass tests.

## 19. ENVIRONMENT AND DOCUMENTATION

Create `.env.example` containing variable names only, never real secrets.

Include configuration for:
- Anthropic API key.
- Cheap and strategic model IDs.
- Supabase URL.
- Supabase publishable key.
- Server-only Supabase credentials if necessary.
- Match and global budgets.
- Model output limits.
- Tournament concurrency.

Add a README with:
- Prerequisites.
- Installation.
- Environment setup.
- Development commands.
- Test commands.
- Production build.
- Database setup and migrations.
- API credit considerations.
- How to run a local demo.
- How to start a spectator match.
- How to start a human match.
- Known limitations.

Do not assume that Supabase, Vercel, or Anthropic credentials already exist.

## 20. IMPLEMENTATION ORDER

Implement in this order:

PHASE 1: Project scaffold, types, configuration, and deterministic game engine.

PHASE 2: Unit tests and full-match simulation using deterministic mock agents.

PHASE 3: Claude integration, structured actions, model router, and usage metering.

PHASE 4: Cyberpunk arena UI and live match event feed.

PHASE 5: Human-player mode and private information security.

PHASE 6: Persistence and replay.

PHASE 7: Tournament Lab and aggregate metrics.

PHASE 8: Production validation, responsive polish, and documentation.

Do not skip the game engine to work on animations.

After each phase:
- Run relevant tests.
- Check TypeScript errors.
- Fix regressions.
- Update the implementation checklist.

## 21. ACCEPTANCE CRITERIA

The MVP is acceptable only when:

1. A user can start a spectator match.
2. Five agents make actual structured action decisions.
3. The game engine rejects illegal actions.
4. A complete match reaches a recorded terminal state.
5. The winner is calculated by code.
6. The event feed shows actual resolved events.
7. The human mode allows one human and four AI agents to play.
8. Private information is filtered server-side.
9. Replays use recorded actions and outcomes without fresh model calls.
10. Model usage and estimated cost are recorded.
11. A tournament can run multiple matches and compute real aggregate statistics.
12. The core game-engine tests pass.
13. The application builds successfully.
14. Missing credentials produce a clear setup message or an explicitly labelled local demo.
15. The interface is polished, responsive, and free of fake live data.

## FINAL INSTRUCTION

Start by inspecting the repository and reporting the implementation checklist. Then immediately begin building.

Prioritize correctness, a genuinely playable match, and a premium visual experience.

Do not produce a large collection of placeholder components. Do not hardcode outcomes. Do not let Claude control the authoritative game state. Do not claim features are complete without verification.

Build the smallest complete version first, then improve it incrementally.

The final result should be something I can run locally, test, deploy, and proudly demonstrate as a real AI-agent competition.
