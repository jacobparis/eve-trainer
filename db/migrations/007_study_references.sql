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

create index if not exists study_references_user_updated_idx
  on study_references (user_id, updated_at desc);

create index if not exists study_references_topics_idx
  on study_references using gin (topics);

create index if not exists study_references_search_idx
  on study_references using gin (search_vector);

alter table cards add column if not exists reference_id uuid;

alter table cards drop constraint if exists cards_reference_id_fkey;

alter table cards
  add constraint cards_reference_id_fkey
  foreign key (reference_id) references study_references(id) on delete set null;
