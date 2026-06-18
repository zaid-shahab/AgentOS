-- Add source column to track which file a chunk came from
alter table knowledge_base add column if not exists source text;
