CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store TEXT NOT NULL,
  market TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  image TEXT,
  category TEXT,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store, market, external_id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price REAL NOT NULL,
  list_price REAL,
  currency TEXT NOT NULL,
  in_stock INTEGER NOT NULL DEFAULT 1,
  seller TEXT,
  seller_type TEXT NOT NULL DEFAULT 'unknown',
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ref_price REAL NOT NULL,
  new_price REAL NOT NULL,
  drop_pct INTEGER NOT NULL,
  deal_type TEXT NOT NULL, -- 'pricing_error' | 'real' | 'fake'
  confidence TEXT NOT NULL, -- 'high' | 'medium' | 'low'
  seller_name TEXT,
  seller_type TEXT NOT NULL DEFAULT 'unknown',
  reasons_json TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  notified INTEGER NOT NULL DEFAULT 0,
  detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crawl_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store TEXT NOT NULL,
  market TEXT NOT NULL,
  kind TEXT NOT NULL,      -- 'category' | 'keyword' | 'deals' | 'watch'
  value TEXT NOT NULL,
  mode TEXT NOT NULL,      -- 'price-asc' | 'newest' | 'discount'
  priority INTEGER NOT NULL DEFAULT 10,
  next_run_at TEXT NOT NULL,
  interval_min INTEGER NOT NULL DEFAULT 60,
  hits_count INTEGER NOT NULL DEFAULT 0,
  last_run TEXT,
  last_status TEXT,
  unchanged_runs INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  paused_until TEXT,
  UNIQUE(store, market, kind, value, mode)
);

CREATE TABLE IF NOT EXISTS category_stats (
  category_id TEXT PRIMARY KEY,
  median_price REAL NOT NULL,
  p10_price REAL NOT NULL,
  sample_size INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_price_history_product_captured ON price_history(product_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_deals_product ON deals(product_id);
CREATE INDEX IF NOT EXISTS idx_deals_detected ON deals(detected_at);
CREATE INDEX IF NOT EXISTS idx_crawl_targets_next ON crawl_targets(next_run_at, priority DESC);
CREATE INDEX IF NOT EXISTS idx_products_lookup ON products(store, market, external_id);
