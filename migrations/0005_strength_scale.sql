-- v1.1.1: strength reads Weak / Balanced / Strong (was Watery / Balanced / Muddy).
-- Watery → weak, muddy → strong, balanced stays. Extraction (under, balanced, over, uneven) is
-- unchanged. SQLite can't change a CHECK in place, so the brews table is rebuilt (nothing
-- references it).

CREATE TABLE brews_new (
  id TEXT PRIMARY KEY,
  num INTEGER NOT NULL UNIQUE,
  bean_id TEXT REFERENCES beans (id) ON DELETE CASCADE,
  brewed_at TEXT NOT NULL,
  method TEXT,
  grinder TEXT,
  grind REAL,
  dose_g REAL,
  water_ml REAL,
  water_temp_c REAL,
  recipe_notes TEXT,
  rating REAL CHECK (rating >= 0 AND rating <= 10),
  extraction TEXT CHECK (extraction IN ('under', 'balanced', 'over', 'uneven')),
  strength TEXT CHECK (strength IN ('weak', 'balanced', 'strong')),
  tasting_notes TEXT,
  next_time TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  rating_skipped INTEGER NOT NULL DEFAULT 0
);

INSERT INTO brews_new (id, num, bean_id, brewed_at, method, grinder, grind, dose_g, water_ml,
  water_temp_c, recipe_notes, rating, extraction, strength, tasting_notes, next_time, created_at,
  updated_at, rating_skipped)
SELECT id, num, bean_id, brewed_at, method, grinder, grind, dose_g, water_ml, water_temp_c,
  recipe_notes, rating, extraction,
  CASE strength WHEN 'watery' THEN 'weak' WHEN 'muddy' THEN 'strong' WHEN 'balanced' THEN 'balanced' END,
  tasting_notes, next_time, created_at, updated_at, rating_skipped
FROM brews;

DROP TABLE brews;
ALTER TABLE brews_new RENAME TO brews;
CREATE INDEX idx_brews_bean ON brews (bean_id, brewed_at);
CREATE INDEX idx_brews_brewed_at ON brews (brewed_at);
