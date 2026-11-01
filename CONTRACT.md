# The rounds file format

The panel is only a reader. Anything that can append a line of JSON can feed it — this is that contract.

```
$HERDR_ROUNDS_DIR/                     default: ~/.herdr-rounds
├─ index.json                          optional
└─ rounds/<terminal>.jsonl             one JSON object per line, one line per round
```

`<terminal>` is herdr's terminal address — the same value as `$HC_TERMINAL_ID`.

## One round

```json
{"n":3,"prompt":"make the send button work","startedAt":1793540000000,"endedAt":1793540060000,"durMs":60000,"tools":4,"summary":"The button now sends. Enter still works."}
```

| field | type | required | meaning |
|---|---|---|---|
| `n` | number | yes | 1-based round number inside this conversation; the panel sorts by it |
| `prompt` | string | yes | the instruction, plain text, ~200 chars is plenty |
| `startedAt` | ms epoch | yes | when the round began |
| `endedAt` | ms epoch \| null | no | `null`/missing = still running |
| `durMs` | number | no | derived from the two timestamps when missing |
| `tools` | number | no | how many actions the turn took; producer-defined |
| `summary` | string | no | one or two plain sentences about what the round did |
| `blocked` | string | no | why it is waiting (approval, input) |
| `terminal` `session` `cwd` | string | no | metadata the panel ignores, kept for your own tooling |

## Rules a writer must follow, and a reader must survive

1. **One instruction = one round.** A message typed while the round is running belongs to that round.
2. **Append or rewrite, both are fine.** The panel re-reads the whole file on change.
3. **Half-written lines are tolerated.** A reader skips a line that does not parse; a writer should write whole lines.
4. **Unknown fields are ignored**, so you can carry extra data.
5. **Duplicate `n` keeps the later line.**
6. **`endedAt` missing for more than 30 minutes is treated as stale**, not "running".

## Smallest possible writer

```js
// after the agent finishes a turn
const line = JSON.stringify({
  n: previousCount + 1,
  prompt: instruction.slice(0, 200),
  startedAt,
  endedAt: Date.now(),
  tools,
  summary: reply.split(/\n/).find(Boolean)?.slice(0, 200) ?? "",
});
await fs.appendFile(`${dir}/rounds/${terminal}.jsonl`, line + "\n");
```

Or, without writing any code, use the shipped CLI:

```sh
node bin/rounds-write.mjs start --terminal t12 --prompt "make the button blue"
node bin/rounds-write.mjs step  --terminal t12        # once per tool call
node bin/rounds-write.mjs end   --terminal t12 --summary "Done: it is blue."
```

`bin/rounds-write.mjs` reads `HERDR_ROUNDS_DIR` and `HC_TERMINAL_ID`, so a hook only has to call it.

## `index.json` (optional)

```json
{"t12":{"title":"Make the send button work","titleZh":"让发送按钮能用","sessionPath":"…","rounds":3}}
```

`title` shows as a small subtitle; `titleZh` (or any curated title) wins as the heading. Without it the
panel uses the conversation's first instruction, which is already in the person's language.
