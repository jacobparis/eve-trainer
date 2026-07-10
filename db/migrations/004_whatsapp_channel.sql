alter table user_profiles
  add column if not exists preferred_whatsapp_thread_id text;
