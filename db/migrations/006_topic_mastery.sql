alter table cards add column if not exists topic text;

update cards
set topic = coalesce(generator_id, 'uncategorized')
where topic is null;

alter table cards alter column topic set not null;

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
