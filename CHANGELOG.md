# Changelog

## 0.2.0 — 2026-11-02

- Liveness stops being a guess. The writer publishes `live` and `hb` in `index.json`; when that is
  stale or absent the panel asks `omp session lease` whether a live process still holds the session.
  A crashed or closed session no longer looks like work in progress.
- Titles come from the fixed-width slot at the top of an omp session file (256 bytes) instead of a
  transcript scan, and are re-read when the file moves, so `title.refreshAfterPrompts` renames land
  without a restart.
- The running card shows what is actually happening — `retry_fallback_applied`, `ttsr_triggered`,
  `goal_updated` and compaction — instead of a fixed "Working…".
- Contract: new round field `doing`; `index.json` gains `sessionId`, `live` and `hb`; the staleness
  rule now follows the writer's heartbeat.
- Tests: the adapter is driven end to end through a fake `pi` and a real session file.

## 0.1.0 — 2026-11-01

First public release.

- Panel: rounds list for the visible tab, live running round, three-line cards with click-to-expand,
  relative finish times, bottom composer with a Send button, automatic tab naming.
- i18n: English and Chinese tables, detected from the system locale, switchable in the header.
- Format: `~/.herdr-rounds/rounds/<terminal>.jsonl` documented in `CONTRACT.md`.
- Adapters: omp extension (`adapters/omp/rounds-omp.ts`), generic CLI (`bin/rounds-write.mjs`).
- Tests: 11 assertions over layout, store, i18n and the writer; CI on Node 20/22, Linux and Windows.
