-- Fix match_knowledge to exclude rows with NULL embeddings (inserted before vector embeddings were added).
-- Also sets match_count default to 5 to align with executor.ts.
create or replace function match_knowledge(
  query_embedding vector(1536),
  match_account   text,
  match_count     int default 5
)
returns table (content text, similarity float)
language sql stable
as $$
  select content, 1 - (embedding <=> query_embedding) as similarity
  from knowledge_base
  where account_id = match_account
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
