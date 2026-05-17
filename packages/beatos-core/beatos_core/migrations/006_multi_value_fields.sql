-- v0.0.12: producer, genre, mood become JSON arrays (multi-value).
-- Existing single-string values become single-element arrays.
-- All three columns stay TEXT (SQLite has no native array type); JSON1
-- is used at the query layer.

-- Convert non-NULL single values to JSON arrays. Idempotent via the
-- LIKE guard: if value already starts with '[' assume it's already JSON.
UPDATE track SET producer = json_array(producer)
  WHERE producer IS NOT NULL AND producer NOT LIKE '[%';

UPDATE track SET genre = json_array(genre)
  WHERE genre IS NOT NULL AND genre NOT LIKE '[%';

UPDATE track SET mood = json_array(mood)
  WHERE mood IS NOT NULL AND mood NOT LIKE '[%';
