alter table user_profiles
  add column if not exists preferred_slack_channel_id text;

alter table attempts
  add column if not exists slot_id uuid references session_slots(id) on delete set null;

create table if not exists dynamic_reviewables (
  id text primary key,
  user_id uuid not null references user_profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  quiz_modes jsonb not null,
  generator text not null,
  grader text not null,
  constraints jsonb not null,
  source_candidate_batch_id uuid references learning_item_candidate_batches(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists dynamic_reviewables_user_id_idx
  on dynamic_reviewables (user_id);

create index if not exists attempts_slot_id_idx
  on attempts (slot_id);
