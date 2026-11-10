-- Ratio schema v1.
-- ids are TEXT (uuids for new rows); timestamps are ISO-8601 strings; calendar dates are
-- YYYY-MM-DD; string sets are JSON arrays stored as TEXT. Water temperature is stored in °C.

CREATE TABLE roasters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  website TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One row per bag of coffee.
CREATE TABLE beans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  roaster_id TEXT REFERENCES roasters (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('ordered', 'received', 'freezing', 'resting', 'drinking', 'finished')),
  roasted_on TEXT,
  received_on TEXT,
  rest_until TEXT,
  thawed_on TEXT,
  finished_on TEXT,
  tasting_notes TEXT,
  roaster_notes TEXT,
  origins TEXT NOT NULL DEFAULT '[]',
  varieties TEXT NOT NULL DEFAULT '[]',
  region TEXT,
  process TEXT,
  process_notes TEXT,
  altitude TEXT,
  bag_g REAL,
  cost REAL,
  notes TEXT,
  buy_again TEXT CHECK (buy_again IN ('definitely', 'yes', 'maybe', 'no')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_beans_roaster ON beans (roaster_id);
CREATE INDEX idx_beans_status ON beans (status);

CREATE TABLE brews (
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
  strength TEXT CHECK (strength IN ('watery', 'balanced', 'muddy')),
  tasting_notes TEXT,
  next_time TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_brews_bean ON brews (bean_id, brewed_at);
CREATE INDEX idx_brews_brewed_at ON brews (brewed_at);

-- Image files live in R2 under a key that mirrors the record they belong to:
--   beans/<bean id>/<image id>.<ext>       (bag photos)
--   roasters/<roaster id>/<image id>.<ext> (logos)
CREATE TABLE images (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('bean', 'roaster')),
  owner_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  filename TEXT,
  width INTEGER,
  height INTEGER,
  size INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_images_owner ON images (owner_type, owner_id, sort_order);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE login_attempts (
  ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);
CREATE INDEX idx_login_attempts_ip ON login_attempts (ip, attempted_at);
