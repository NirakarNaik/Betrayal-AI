-- Agent Fight Club — Betrayal Protocol schema.
-- The server talks to Postgres with the service-role key (server-side only).
-- Row-level security is enabled on every table with NO anon/authenticated
-- policies, so the publishable key cannot read secrets directly. Public data is
-- served exclusively through the Next.js API, which filters per viewer.

create table if not exists public.tournaments (
  id text primary key,
  status text not null check (status in ('running', 'completed', 'cancelled', 'failed')),
  config jsonb not null,
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  id text primary key,
  seed bigint not null,
  ruleset_id text not null,
  mode text not null check (mode in ('spectator', 'human')),
  status text not null check (status in ('running', 'paused', 'completed', 'failed', 'cancelled')),
  agent_mode text not null check (agent_mode in ('live', 'demo')),
  round int not null,
  phase text not null,
  winner_id text,
  terminal jsonb,
  tournament_id text references public.tournaments (id) on delete set null,
  setup jsonb not null,
  -- Server-only orchestration metadata (decision log, human token hash).
  server_meta jsonb not null default '{}'::jsonb,
  list_item jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists matches_created_idx on public.matches (created_at desc);
create index if not exists matches_tournament_idx on public.matches (tournament_id);
create index if not exists matches_status_idx on public.matches (status);

create table if not exists public.match_players (
  match_id text not null references public.matches (id) on delete cascade,
  player_id text not null,
  name text not null,
  kind text not null check (kind in ('ai', 'human')),
  personality_id text,
  seat int not null,
  primary key (match_id, player_id)
);

-- Secret objectives and clues live apart from public match data.
create table if not exists public.player_private_state (
  match_id text not null references public.matches (id) on delete cascade,
  player_id text not null,
  objective jsonb not null,
  clues jsonb not null default '[]'::jsonb,
  primary key (match_id, player_id)
);

-- Append-only engine input log: the source of truth for replays.
create table if not exists public.match_inputs (
  match_id text not null references public.matches (id) on delete cascade,
  seq int not null,
  input jsonb not null,
  created_at timestamptz not null default now(),
  primary key (match_id, seq)
);

-- Revealed committed actions (written after resolution). Unique per round/player
-- prevents duplicate commits.
create table if not exists public.committed_actions (
  match_id text not null references public.matches (id) on delete cascade,
  round int not null,
  player_id text not null,
  proposal jsonb not null,
  source text not null,
  decision_summary text,
  created_at timestamptz not null default now(),
  primary key (match_id, round, player_id)
);

-- Append-only event log; (match_id, seq) uniqueness prevents duplicate events.
create table if not exists public.game_events (
  match_id text not null references public.matches (id) on delete cascade,
  seq int not null,
  event_id text not null,
  type text not null,
  round int not null,
  phase text not null,
  visibility jsonb not null,
  summary text not null,
  data jsonb not null,
  at timestamptz not null,
  primary key (match_id, seq)
);
create index if not exists game_events_type_idx on public.game_events (match_id, type);

create table if not exists public.agent_memories (
  match_id text not null references public.matches (id) on delete cascade,
  player_id text not null,
  memory jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

create table if not exists public.tournament_results (
  tournament_id text not null references public.tournaments (id) on delete cascade,
  match_id text not null,
  status text not null check (status in ('completed', 'failed', 'cancelled')),
  summary jsonb not null,
  primary key (tournament_id, match_id)
);

create table if not exists public.api_usage (
  id text primary key,
  match_id text,
  tournament_id text,
  player_id text,
  model text not null,
  purpose text not null,
  input_tokens int not null,
  output_tokens int not null,
  cache_read_tokens int not null default 0,
  cache_creation_tokens int not null default 0,
  duration_ms int not null,
  estimated_cost_usd numeric(12, 6) not null,
  outcome text not null,
  record jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists api_usage_match_idx on public.api_usage (match_id);
create index if not exists api_usage_created_idx on public.api_usage (created_at desc);

alter table public.tournaments enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.player_private_state enable row level security;
alter table public.match_inputs enable row level security;
alter table public.committed_actions enable row level security;
alter table public.game_events enable row level security;
alter table public.agent_memories enable row level security;
alter table public.tournament_results enable row level security;
alter table public.api_usage enable row level security;
-- No policies are created: only the service role (server) can access these tables.
