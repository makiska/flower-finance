CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'expense')),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  amount DOUBLE PRECISION NOT NULL,
  comment TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);
CREATE INDEX IF NOT EXISTS idx_operations_date ON operations(date);

INSERT INTO categories (name) VALUES
  ('Ароидные'),
  ('Хойи'),
  ('Бегонии'),
  ('Папоротники'),
  ('Другие растения'),
  ('Расходники')
ON CONFLICT (name) DO NOTHING;
