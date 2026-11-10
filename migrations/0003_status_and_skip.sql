-- v0.3: "received" is retired (bags go ordered → resting/freezing → drinking → finished),
-- and a brew can be dismissed from "Waiting for a rating" without a rating.
UPDATE beans SET status = 'resting' WHERE status = 'received';
ALTER TABLE brews ADD COLUMN rating_skipped INTEGER NOT NULL DEFAULT 0;
