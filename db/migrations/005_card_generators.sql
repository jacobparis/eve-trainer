alter table cards
  add column if not exists generator_id text,
  add column if not exists fingerprint text;

alter table cards drop constraint if exists cards_source_check;

alter table cards
  add constraint cards_source_check
  check (source in ('question', 'image', 'generator'));

create unique index if not exists cards_generator_fingerprint_idx
  on cards (user_id, generator_id, fingerprint)
  where generator_id is not null;
