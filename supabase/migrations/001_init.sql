-- Enable pgvector
create extension if not exists vector;

-- ─── Automation configs ───────────────────────────────────────────────────────
create table if not exists automation_configs (
  id         uuid primary key default gen_random_uuid(),
  account_id text not null,
  config     jsonb not null,
  created_at timestamptz default now()
);
create index on automation_configs (account_id, created_at desc);

-- ─── Interactions (Data Lake) ─────────────────────────────────────────────────
create table if not exists interactions (
  id           uuid primary key default gen_random_uuid(),
  account_id   text not null,
  platform     text not null,
  sender_id    text,
  message      text,
  sentiment    text,
  intent_tag   text,
  action_taken text,
  created_at   timestamptz default now()
);
create index on interactions (account_id, created_at desc);
create index on interactions (account_id, intent_tag);
create index on interactions (account_id, sentiment);

-- ─── Leads ───────────────────────────────────────────────────────────────────
create table if not exists leads (
  id         uuid primary key default gen_random_uuid(),
  account_id text not null,
  sender_id  text,
  message    text,
  intent_tag text,
  created_at timestamptz default now()
);

-- ─── Knowledge Base (pgvector) ────────────────────────────────────────────────
create table if not exists knowledge_base (
  id         uuid primary key default gen_random_uuid(),
  account_id text not null,
  content    text not null,
  embedding  vector(1536),  -- text-embedding-3-small dimensions
  created_at timestamptz default now()
);
create index on knowledge_base using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ─── Notifications (in-app report delivery) ───────────────────────────────────
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  account_id text not null,
  title      text,
  body       text,
  read       boolean default false,
  created_at timestamptz default now()
);

-- ─── pgvector semantic search function ───────────────────────────────────────
create or replace function match_knowledge(
  query_embedding vector(1536),
  match_account   text,
  match_count     int default 3
)
returns table (content text, similarity float)
language sql stable
as $$
  select content, 1 - (embedding <=> query_embedding) as similarity
  from knowledge_base
  where account_id = match_account
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ─── Read-only query executor (for Text-to-SQL) ───────────────────────────────
-- IMPORTANT: restrict this to SELECT only — enforced in the app layer too
create or replace function run_readonly_query(query text)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  -- Reject any mutation keywords
  if query ~* '\m(insert|update|delete|drop|truncate|alter|create|grant|revoke)\M' then
    raise exception 'Mutation queries are not allowed';
  end if;
  execute 'select json_agg(t) from (' || query || ') t' into result;
  return coalesce(result, '[]'::json);
end;
$$;
