-- v1.1.7: a brew remembers whether its dose and water were locked to the ratio.
ALTER TABLE brews ADD COLUMN ratio_lock INTEGER NOT NULL DEFAULT 1;
