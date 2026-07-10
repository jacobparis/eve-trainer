alter table user_profiles alter column study_policy drop not null;
alter table user_profiles add column if not exists last_scheduled_review_on date;

create table if not exists cards (
  id uuid primary key,
  user_id uuid not null references user_profiles(id) on delete cascade,
  question text not null,
  answer text not null,
  source text not null check (source in ('question', 'image')),
  due_at timestamptz not null default now(),
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question)
);

create index if not exists cards_user_due_idx on cards (user_id, due_at);

create table if not exists active_reviews (
  user_id uuid not null references user_profiles(id) on delete cascade,
  channel text not null,
  thread_key text not null,
  card_id uuid not null references cards(id) on delete cascade,
  asked_at timestamptz not null default now(),
  primary key (channel, thread_key)
);
