drop index if exists session_threads_channel_thread_key_idx;

create unique index if not exists session_threads_open_channel_thread_key_idx
  on session_threads (channel, thread_key)
  where status = 'open';
