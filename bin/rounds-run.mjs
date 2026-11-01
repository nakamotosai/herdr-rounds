#!/usr/bin/env node
// Wrap any agent CLI so the panel sees one round per run:
//
//   node bin/rounds-run.mjs "make the button blue" -- opencode run "make the button blue"
//   node bin/rounds-run.mjs "fix the import"      -- codex exec "fix the import"
//
// The instruction opens the round, the command runs with your terminal attached, and its last
// line of output closes the round. Exit status is the command's own.
//
// Reads $HERDR_ROUNDS_DIR (default ~/.herdr-rounds) and $HC_TERMINAL_ID.

import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { apply, ledgerFile } from "./rounds-lib.mjs";

const argv = process.argv.slice(2);
const split = argv.indexOf("--");
const prompt = split === -1 ? "" : argv.slice(0, split).join(" ").trim();
const command = split === -1 ? [] : argv.slice(split + 1);

const root = process.env.HERDR_ROUNDS_DIR || path.join(os.homedir(), ".herdr-rounds");
const terminal = process.env.HC_TERMINAL_ID || process.env.HERDR_TERMINAL_ID || "";

if (!prompt || command.length === 0) {
  console.error('usage: rounds-run "instruction" -- <command...>');
  process.exit(2);
}
if (!terminal) {
  console.error("rounds-run: no HC_TERMINAL_ID, nothing to show");
  process.exit(2);
}

const file = ledgerFile(root, terminal);
await apply(file, "start", { prompt });

const [bin, ...args] = command;
// npm-installed CLIs are .cmd shims on Windows, so the command runs through the shell; quote
// every word that has a space so arguments survive it.
const quote = (word) => (/[\s"]/.test(word) ? `"${word.replace(/"/g, '\\"')}"` : word);
const line = [bin, ...args].map(quote).join(" ");
const child = spawn(line, { stdio: ["inherit", "pipe", "pipe"], shell: process.platform === "win32" });

let output = "";
const keep = (chunk) => {
  process.stdout.write(chunk);
  output = (output + chunk.toString()).slice(-8000);
};
child.stdout?.on("data", keep);
child.stderr?.on("data", (chunk) => {
  process.stderr.write(chunk);
  output = (output + chunk.toString()).slice(-8000);
});

const code = await new Promise((resolve) => {
  child.on("close", (value) => resolve(value ?? 1));
  child.on("error", (error) => {
    output += `\n${error?.message ?? error}`;
    resolve(1);
  });
});

const lines = output
  .split("\n")
  .map((line) => line.replace(/\s+/g, " ").trim())
  .filter((line) => line && !line.startsWith(">")); // drop the CLI's own banner lines
const summary = code === 0 ? (lines.at(-1) ?? "") : `exited ${code}: ${lines.at(-1) ?? ""}`;
await apply(file, "end", { summary });
process.exit(code);
