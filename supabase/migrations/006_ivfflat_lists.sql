-- Rebuild the ivfflat index with lists=10 (was 100).
-- pgvector requires at least `lists` rows before the index activates;
-- with lists=100 and a demo dataset of <100 rows, every query does a full sequential scan.
-- lists=10 means the index becomes useful with as few as 10 rows.
DO $$
DECLARE
  idx text;
BEGIN
  SELECT c.relname INTO idx
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_am a ON a.oid = c.relam
  WHERE t.relname = 'knowledge_base' AND a.amname = 'ivfflat';

  IF idx IS NOT NULL THEN
    EXECUTE format('DROP INDEX IF EXISTS %I', idx);
  END IF;
END $$;

CREATE INDEX ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
