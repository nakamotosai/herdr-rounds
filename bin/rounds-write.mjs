#!/usr/bin/env node
// A tiny writer for any agent's hooks: one round per instruction, appended to CONTRACT.md's jsonl.
//
//   node bin/rounds-write.mjs start   --terminal t12 --prompt "make the button blue"
//   node bin/rounds-write.mjs step    --terminal t12
//   node bin/rounds-write.mjs doing   --terminal t12 --text "compacting"
//   node bin/rounds-write.mjs end     --terminal t12 --summary "Done: the button is blue."
//   node bin/rounds-write.mjs end     --terminal t12 --summary-file note.txt
//
// Reads $HERDR_ROUNDS_DIR (default ~/.herdr-rounds) and HC_TERMINAL_ID (default: --terminal).
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { apply, ledgerFile } from "./rounds-lib.mjs";

const args = process.argv.slice(2);
const command = args.shift() ?? "";
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

const root = process.env.HERDR_ROUNDS_DIR || path.join(os.homedir(), ".herdr-rounds");
const terminal = flag("terminal") || process.env.HC_TERMINAL_ID || "";
if (!terminal) {
  console.error("rounds-write: need --terminal or HC_TERMINAL_ID");
  process.exit(2);
}

if (!["start", "step", "doing", "end"].includes(command)) {
  console.error("rounds-write: commands are start, step, doing, end");
  process.exit(2);
}

const summary = flag("summary") ?? (flag("summary-file") ? await fs.readFile(flag("summary-file"), "utf8") : "");
const line = await apply(ledgerFile(root, terminal), command, {
  prompt: flag("prompt") ?? "",
  summary,
  doing: flag("text") ?? "",
});

if (command === "start" && !line) {
  console.error("rounds-write: start needs --prompt");
  process.exit(2);
}
if (line) console.log(line);
