-- Idempotent catalog upgrade. Never drop or rewrite existing rows.
ALTER TABLE products ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subgroup TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_preset BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS preset_id INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS catalog_candidates (
  id SERIAL PRIMARY KEY,
  normalized_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  detected_subgroup TEXT,
  users_count INTEGER NOT NULL DEFAULT 1,
  created_by_users TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_owner ON products (user_id);
CREATE INDEX IF NOT EXISTS idx_products_preset ON products (is_preset);
