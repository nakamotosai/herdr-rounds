# Changelog

## 0.1.0 — 2026-11-01

First public release.

- Panel: rounds list for the visible tab, live running round, three-line cards with click-to-expand,
  relative finish times, bottom composer with a Send button, automatic tab naming.
- i18n: English and Chinese tables, detected from the system locale, switchable in the header.
- Format: `~/.herdr-rounds/rounds/<terminal>.jsonl` documented in `CONTRACT.md`.
- Adapters: omp extension (`adapters/omp/rounds-omp.ts`), generic CLI (`bin/rounds-write.mjs`).
- Tests: 11 assertions over layout, store, i18n and the writer; CI on Node 20/22, Linux and Windows.
