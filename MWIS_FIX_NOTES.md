# Skyward — MWIS Forecast date fix (2026-06-13)

**Bug (Callum):** the Forecast tab repeated How windy / How wet / Cloud…
groups with only a divider between them — no day headings.

**Diagnosis (verified live):** /api/mwis returned days=3 with all fields but
dates=[null,null,null]. forecast.js renders d.date when present, so the bug
was backend-only: MWIS dropped the bold markup the date regex relied on; the
visible text per day block is now "The Northwest Highlands Friday 12th June
2026 Last updated …".

**Fix (backend/main.py, _parse_mwis):** three-tier date extraction —
(a) legacy bold pair; (b) the visible weekday-date text in the block's first
600 chars → "Friday 12th June"; (c) positional "Day 1/2/3" so days can NEVER
render unlabelled again. Tested against all three markup generations + the
SAIS suite (all pass). BACKEND CHANGED → Pi needs a service restart at deploy.
