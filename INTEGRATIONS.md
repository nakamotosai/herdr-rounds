# Wiring an agent to the panel

The panel reads `~/.herdr-rounds` and nothing else. Anything that writes one JSON line per
instruction shows up — these are the integrations that ship here, all tested against the real CLIs.

| agent | how it connects | writes | verified |
|---|---|---|---|
| **omp** | `adapters/omp/rounds-omp.ts` — an omp extension | every turn, from the transcript | ✅ live run |
| **pi** | the same file, as a pi extension | every turn, from the transcript | ✅ live run |
| **claude** (Claude Code) | three hooks calling `bin/rounds-hook.mjs` | prompt, tool count, closing message | ✅ live run |
| **codex** | `bin/rounds-run.mjs` wrapper around `codex exec` | one round per run | ✅ live run |
| **opencode** | `bin/rounds-run.mjs` wrapper around `opencode run` | one round per run | ✅ live run |
| anything else | `bin/rounds-write.mjs` from any hook | whatever you feed it | — |

"Verified" means: a real CLI ran with a real model and the panel's files ended up with the
instruction, the elapsed time and a closing line.

## omp

```sh
cp adapters/omp/rounds-omp.ts ~/.omp/agent/extensions/rounds-omp.ts
```

Records from the session transcript, so a round appears even for turns that started before the
extension loaded. Adds `rounds-backfill` to rebuild a conversation from its transcript.

## pi

```sh
cp adapters/omp/rounds-omp.ts ~/.pi/agent/extensions/rounds.ts
```

Same file, same API (`pi.on`, `ctx.sessionManager`). pi settles an agent instead of ending it; the
adapter listens for both.

## claude

Add to `~/.claude/settings.json` (paths adjusted to where you cloned this repo):

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node", "args": ["<repo>/bin/rounds-hook.mjs", "start"], "timeout": 10 }] }],
    "PostToolUse":      [{ "hooks": [{ "type": "command", "command": "node", "args": ["<repo>/bin/rounds-hook.mjs", "step"],  "timeout": 10 }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "node", "args": ["<repo>/bin/rounds-hook.mjs", "end"],   "timeout": 10 }] }]
  }
}
```

The hook reads the payload Claude Code sends on stdin: `prompt` opens the round,
`last_assistant_message` closes it, `transcript_path` is used when that field is missing.

## codex

Codex hooks must be trusted once, and the trust hash is written by the interactive CLI — so the
reliable route is the wrapper:

```sh
node bin/rounds-run.mjs "fix the import" -- codex exec "fix the import"
```

If you prefer native hooks, `~/.codex/hooks.json` accepts the same `rounds-hook.mjs` commands as
claude (`UserPromptSubmit` / `PostToolUse` / `Stop`); run `codex` once and approve them.

## opencode

```sh
node bin/rounds-run.mjs "say hi" -- opencode run "say hi"
```

opencode's plugin API loads plugins in its shared server process and does not call the `server`
export on 2.x, so there is no per-terminal hook to use yet. The wrapper needs no configuration and
records the same round.

## Anything else

```sh
node bin/rounds-write.mjs start --terminal "$HC_TERMINAL_ID" --prompt "make the button blue"
node bin/rounds-write.mjs step  --terminal "$HC_TERMINAL_ID"          # once per tool call
node bin/rounds-write.mjs end   --terminal "$HC_TERMINAL_ID" --summary "Done: it is blue."
```

`HERDR_ROUNDS_DIR` moves the data folder (default `~/.herdr-rounds`); `HC_TERMINAL_ID` is set by
herdr inside every terminal, and the panel keys conversations by it.
