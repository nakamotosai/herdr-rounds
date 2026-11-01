#!/usr/bin/env node
// A tiny writer for any agent's hooks: one round per instruction, appended to CONTRACT.md's jsonl.
//
//   node bin/rounds-write.mjs start   --terminal t12 --prompt "make the button blue"
//   node bin/rounds-write.mjs step    --terminal t12
//   node bin/rounds-write.mjs end     --terminal t12 --summary "Done: the button is blue."
//   node bin/rounds-write.mjs end     --terminal t12 --summary-file note.txt
//
// Reads $HERDR_ROUNDS_DIR (default ~/.herdr-rounds) and HERDR_TERMINAL_ID (default: --terminal).
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

const file = path.join(root, "rounds", `${terminal}.jsonl`);
const now = Date.now();

async function read() {
  try {
    return (await fs.readFile(file, "utf8"))
      .split("\n").filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter((row) => row && typeof row.n === "number");
  } catch {
    return [];
  }
}

async function write(rows) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

const rows = await read();
const open = rows.at(-1) && !rows.at(-1).endedAt ? rows.at(-1) : null;

if (command === "start") {
  const prompt = String(flag("prompt") ?? "").trim();
  if (!prompt) {
    console.error("rounds-write: start needs --prompt");
    process.exit(2);
  }
  if (open) {
    open.endedAt = now;
    open.durMs = Math.max(0, now - open.startedAt);
  }
  rows.push({ n: rows.length + 1, prompt: prompt.slice(0, 200), startedAt: now, endedAt: null, tools: 0, summary: "" });
  await write(rows);
  console.log(`started round ${rows.length}`);
} else if (command === "step") {
  if (!open) process.exit(0);
  open.tools = (open.tools ?? 0) + 1;
  await write(rows);
} else if (command === "end") {
  if (!open) process.exit(0);
  const summary = flag("summary") ?? (flag("summary-file") ? await fs.readFile(flag("summary-file"), "utf8") : "");
  open.summary = String(summary ?? "").replace(/\s+/g, " ").slice(0, 200);
  open.endedAt = now;
  open.durMs = Math.max(0, now - open.startedAt);
  await write(rows);
  console.log(`closed round ${open.n}`);
} else {
  console.error("rounds-write: commands are start, step, end");
  process.exit(2);
}
