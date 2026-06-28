# BeatStars vocab maps

BeatOS canonical genre/mood tokens → exact BeatStars Studio autocomplete labels.
Labels MUST match an entry in the live BeatStars genre/mood dropdown (the
"Click to select and add genre/moods" mat-autocomplete) or the driver's click
finds no option. Source: live capture 2026-06-28 (see beatos-harness Pro spec
`2026-06-28-beatstars-upload-findings.md`, ~250-entry genre taxonomy).
Unmapped tokens fall through unchanged at the callsite (identity fallback).
