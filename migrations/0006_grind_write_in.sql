-- v1.1.1: a grinder can take written-in settings ("1.3.2" on a 1Zpresso) instead of a number.
ALTER TABLE brews ADD COLUMN grind_text TEXT;
