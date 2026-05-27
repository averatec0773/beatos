-- v0.0.29: BPM/key engine switched librosa -> Essentia
-- (RhythmExtractor2013 + KeyExtractor "bgate" profile).
-- Cached rows were produced by the previous algorithm and are no longer
-- comparable; clear them so every asset re-analyzes under the new engine on
-- next request. Re-analysis is lazy and re-cached, so this is a one-time cost.
DELETE FROM analysis_cache;
