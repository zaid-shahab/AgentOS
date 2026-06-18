create table if not exists cron_jobs (
  id              uuid primary key default gen_random_uuid(),
  account_id      text not null,
  name            text not null,
  cron_expression text not null,
  report_type     text not null,
  delivery        text not null,
  delivery_target text,
  description     text,
  created_at      timestamptz default now()
);
create index on cron_jobs (account_id, created_at desc);
