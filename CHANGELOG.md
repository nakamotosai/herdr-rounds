# Changelog

## 0.5.1 — 2026-11-02

- The arrows are a touch larger and use the muted colour, so they read as icons rather than specks.
- `preview.png` shows the new cards.

## 0.5.0 — 2026-11-02

- Who said what is an arrow now: a small up triangle for your instruction, a down triangle for the
  round's result, instead of the words "you" and "did".
- Fixed expanding a card doing nothing. The height clamp stayed at one and two lines after a click,
  so the card grew its text but still clipped it; an expanded card is no longer capped.
- The "tap to read it all" line is gone — the whole card was already the target, and the hint cost a
  line on every card that had one.

## 0.4.1 — 2026-11-02

- The tail is six rounds by default; the rest waits behind a clickable "Show N earlier rounds"
  line instead of being drawn. Expanded, it turns into "Show fewer". Switching tabs collapses it.

## 0.4.0 — 2026-11-02

- The list reads like a conversation: oldest at the top, the round that is still running at the
  bottom, right above the composer. Rounds older than the last six fold into a single
  "N earlier rounds" line, so the newest never sits below the fold.

## 0.3.0 — 2026-11-02

- Five agents, each run against a real CLI and checked in the ledger: omp and pi through the
  extension, claude through three hooks, codex and opencode through `bin/rounds-run.mjs`.
- `bin/rounds-hook.mjs`: one hook entry for CLIs that hand the event over as JSON on stdin; reads the
  instruction from `prompt`, the closing line from `last_assistant_message`, and falls back to the
  transcript.
- `bin/rounds-run.mjs`: wraps any CLI command so a round opens before it and closes after it.
- `bin/rounds-lib.mjs`: the ledger operations the three writers share; `rounds-write.mjs` gains
  `doing --text`.
- The adapter registers its command lazily and tolerates unknown events, so the same file loads in
  omp and pi; pi's `agent_settled` closes the round.
- `INTEGRATIONS.md` documents every wiring and what each one can see.

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
