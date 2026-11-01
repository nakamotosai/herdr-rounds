# Build `rounds` from an empty folder

A brief another agent can build this mod from. Files next to this one are one build of it — rebuild if
yours differs.

## What you are building

A right-docked panel in Herdr that shows one row per instruction in the conversation the current tab is
showing: what the person asked (dim), what that turn got done (bright), how many steps and how long.
Cards show at most three text lines and expand on click. At the bottom, one input box with a **Send**
button that types into that conversation; Enter does the same.

## Shape of the folder

```
mods/rounds/
  main.js      the View (imports below)
  mod.json     {"place":"right","size":420}   → docks itself on first sight
  i18n.js      en + zh tables, Intl-detected, click the locale chip to cycle
  layout.js    pure helpers: fit/short/since/ago/isRunning
  store.js     reads the data folder; never throws
```

No `layouts/` folder. The mod docks through `mod.json`, so it works in anyone's layout.

## Data you read

`~/.herdr-rounds/rounds/<terminal>.jsonl`, one JSON object per line — see `CONTRACT.md`. The panel only
reads; anything that can append a line can feed it. `adapters/omp/rounds-omp.ts` is one writer.

## The parts that are easy to get wrong

1. **Follow the tab, not the focus.** `focused()` can point at the terminal last focused in *another*
   tab. Take the space's active tab, then `panes()` filtered by `tab` and `terminal != null` (a mod pane
   has `terminal: null`), and use that pane's terminal.
2. **A running round is "endedAt missing", not "status working".** Grace window: 30 minutes.
3. **Clamp by width *and* height.** `fit()` estimates pixels; a narrow pane still needs `.max_h(lines * size * 1.5)`.
4. **Localize times in the table**, not with `toLocaleString`, so `9m ago` / `9分钟前` match the rest.
5. **Never rename a tab the person named.** Rename only when `tab.named !== true`, or when the current
   name is the one this panel set (`shared("rounds.tab.<id>")`).
6. **Do not throw in `load()`.** A missing data folder is the normal first-run state: show the
   "install an adapter" empty state instead.
7. **No polling loops.** `cx.timer.every(4000, …)` plus `watchFolder()`; the app reloads a mod on save.

## Verify

```sh
node --test test/                                   # pure logic + the writer CLI
herdr-app check ~/.config/herdr-app/mods/rounds     # loads and renders once
herdr-app shot /tmp/rounds.png                      # then look at the picture
```

Acceptance: with three lines in the data file the panel shows three rows, the newest last, the running
one marked; with no folder it shows the adapter hint, not an empty grey box.
