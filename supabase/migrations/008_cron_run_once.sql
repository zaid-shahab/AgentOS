-- Add run_once flag to cron_jobs
-- Jobs with run_once = true are deleted after their first successful execution
ALTER TABLE cron_jobs ADD COLUMN IF NOT EXISTS run_once boolean DEFAULT false;
