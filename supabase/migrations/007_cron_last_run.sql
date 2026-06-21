alter table cron_jobs add column if not exists last_run_at timestamptz;
