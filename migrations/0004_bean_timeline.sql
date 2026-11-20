-- v1.1: a bag keeps a timeline of its status changes, and a recommended rest in days.
-- Statuses run ordered → freezing → resting → drinking → finished (freezing may be skipped).

CREATE TABLE bean_events (
  id TEXT PRIMARY KEY,
  bean_id TEXT NOT NULL REFERENCES beans(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  on_day TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX bean_events_bean ON bean_events (bean_id, on_day);

ALTER TABLE beans ADD COLUMN rest_days INTEGER;

-- The recommended rest, from the "rest until" day and the roast day where both are known.
UPDATE beans
SET rest_days = CAST(julianday(rest_until) - julianday(roasted_on) AS INTEGER)
WHERE rest_until IS NOT NULL AND roasted_on IS NOT NULL AND rest_until > roasted_on;

-- Fill each existing bag's timeline from the dates it already carries (see backfillTimeline in
-- src/worker/timeline.ts, which does the same for backups made before v1.1).
INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
SELECT lower(hex(randomblob(16))), id, 'ordered', substr(created_at, 1, 10), strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds')
FROM beans
WHERE status = 'ordered' OR (received_on IS NOT NULL AND received_on > substr(created_at, 1, 10));

INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
SELECT lower(hex(randomblob(16))), id,
  CASE WHEN thawed_on IS NOT NULL OR status = 'freezing' THEN 'freezing' ELSE 'resting' END,
  received_on, strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+1 seconds')
FROM beans
WHERE received_on IS NOT NULL AND status <> 'ordered';

INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
SELECT lower(hex(randomblob(16))), id, 'resting', thawed_on, strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+2 seconds')
FROM beans
WHERE thawed_on IS NOT NULL;

INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
SELECT lower(hex(randomblob(16))), b.id, 'drinking', MAX(substr(MIN(r.brewed_at), 1, 10), COALESCE(b.received_on, '')), strftime('%Y-%m-%dT%H:%M:%fZ', b.created_at, '+3 seconds')
FROM beans b JOIN brews r ON r.bean_id = b.id
WHERE b.status IN ('drinking', 'finished')
GROUP BY b.id;

INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
SELECT lower(hex(randomblob(16))), id, 'finished', finished_on, strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+4 seconds')
FROM beans
WHERE finished_on IS NOT NULL AND status = 'finished';

-- Any bag whose latest entry isn't its current status gets one, on the day it was last changed.
INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
SELECT lower(hex(randomblob(16))), b.id, b.status, substr(b.updated_at, 1, 10), strftime('%Y-%m-%dT%H:%M:%fZ', b.updated_at, '+5 seconds')
FROM beans b
WHERE b.status IS NOT (
  SELECT e.status FROM bean_events e WHERE e.bean_id = b.id ORDER BY e.on_day DESC, e.created_at DESC LIMIT 1
);
