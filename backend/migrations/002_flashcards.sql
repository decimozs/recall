CREATE TABLE IF NOT EXISTS flashcard_sets (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  card_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flashcards (
  id SERIAL PRIMARY KEY,
  set_id INTEGER NOT NULL REFERENCES flashcard_sets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '',
  source_excerpt TEXT NOT NULL DEFAULT '',
  task_key TEXT,
  UNIQUE(set_id, position)
);

ALTER TABLE attempts ALTER COLUMN quiz_id DROP NOT NULL;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS flashcard_set_id INTEGER REFERENCES flashcard_sets(id) ON DELETE CASCADE;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS content_mode TEXT NOT NULL DEFAULT 'quiz';

CREATE TABLE IF NOT EXISTS flashcard_review_answers (
  id SERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  is_known BOOLEAN NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(review_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_flashcard_sets_source ON flashcard_sets(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_set ON attempts(flashcard_set_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notion_sync_attempt_unique ON notion_sync_requests(attempt_id);
