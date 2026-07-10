create table if not exists user_profiles (
  id uuid primary key,
  external_user_id text not null unique,
  preferred_whatsapp_thread_id text,
  last_scheduled_review_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key,
  user_id uuid not null references user_profiles(id) on delete cascade,
  question text not null,
  answer text not null,
  topic text not null,
  reference_id uuid,
  source text not null check (source in ('question', 'image', 'generator')),
  generator_id text,
  fingerprint text,
  due_at timestamptz not null default now(),
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question)
);

create table if not exists study_references (
  id uuid primary key,
  user_id uuid not null references user_profiles(id) on delete cascade,
  title text not null,
  topics text[] not null default '{}',
  content text not null,
  content_hash text not null,
  source_type text not null check (source_type in ('image', 'text', 'seed')),
  source_label text,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, content_hash)
);

alter table cards drop constraint if exists cards_reference_id_fkey;

alter table cards
  add constraint cards_reference_id_fkey
  foreign key (reference_id) references study_references(id) on delete set null;

create index if not exists study_references_user_updated_idx
  on study_references (user_id, updated_at desc);

create index if not exists study_references_topics_idx
  on study_references using gin (topics);

create index if not exists study_references_search_idx
  on study_references using gin (search_vector);

create index if not exists cards_user_due_idx on cards (user_id, due_at);

create unique index if not exists cards_generator_fingerprint_idx
  on cards (user_id, generator_id, fingerprint)
  where generator_id is not null;

create index if not exists cards_user_topic_idx on cards (user_id, topic);

create table if not exists review_attempts (
  id uuid primary key,
  user_id uuid not null references user_profiles(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  topic text not null,
  correct boolean not null,
  reviewed_at timestamptz not null default now()
);

create index if not exists review_attempts_user_topic_reviewed_idx
  on review_attempts (user_id, topic, reviewed_at desc);

create table if not exists active_reviews (
  user_id uuid not null references user_profiles(id) on delete cascade,
  channel text not null,
  thread_key text not null,
  card_id uuid not null references cards(id) on delete cascade,
  asked_at timestamptz not null default now(),
  primary key (channel, thread_key)
);
