# Essentia analysis parameters.
ANALYSIS_SAMPLE_RATE = 44100  # RhythmExtractor2013 / KeyExtractor expect 44.1 kHz
MAX_DURATION_SECONDS = 180.0  # cap the analysis window to keep latency bounded

# Key profile. "bgate" won the catalog benchmark (8/8 on the producer's own
# tracks), beating "edma" and "krumhansl" on minor-key trap/rage material —
# notably avoiding the relative-major confusion the others fell into.
KEY_PROFILE = "bgate"

# RhythmExtractor2013 (multifeature) confidence is on a [0, 5.32] scale whose
# documented "good" band starts around 1.5 (below that the beat grid is shaky).
# We map raw 1.5 -> 1.0 so detections Essentia considers good saturate the [0,1]
# scale and clear the renderer's BPM autofill bar (0.7); weaker grids fall below
# it and surface for manual review instead of silently autofilling.
# Tunable: raise to be stricter about what autofills, lower to be more eager.
RHYTHM_CONFIDENCE_GOOD = 1.5
