#!/usr/bin/env node
// Hook entry for CLIs that hand the event over as JSON on stdin — Claude Code and Codex both do.
//
//   node bin/rounds-hook.mjs start     (UserPromptSubmit)
//   node bin/rounds-hook.mjs step      (PostToolUse)
//   node bin/rounds-hook.mjs end       (Stop / SessionEnd)
//
// The payload carries the instruction and, at the end, the closing message; when it does not,
// the transcript path in the payload is read for the last assistant text.
// Reads $HERDR_ROUNDS_DIR (default ~/.herdr-rounds) and $HC_TERMINAL_ID.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { apply, ledgerFile } from "./rounds-lib.mjs";

const command = process.argv[2] ?? "";
const root = process.env.HERDR_ROUNDS_DIR || path.join(os.homedir(), ".herdr-rounds");
const terminal = process.env.HC_TERMINAL_ID || process.env.HERDR_TERMINAL_ID || "";
// Outside a herdr terminal there is no panel to feed; stay silent rather than write junk.
if (!terminal) process.exit(0);

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let payload = {};
try {
  payload = raw.trim() ? JSON.parse(raw) : {};
} catch {
  payload = {};
}

const text = (value) => (typeof value === "string" ? value : "");
const first = (...values) => values.map(text).find((value) => value.trim()) ?? "";

/** The last thing the assistant said, straight from the CLI's own transcript. */
async function lastAssistantText(file) {
  if (!file) return "";
  try {
    const lines = (await fs.readFile(file, "utf8")).split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      const message = entry?.message ?? entry?.payload?.message ?? entry;
      const role = message?.role;
      if (role !== "assistant") continue;
      const content = message?.content;
      const said =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.filter((block) => block?.type === "text").map((block) => block.text ?? "").join(" ")
            : "";
      if (said.trim()) return said;
    }
  } catch {
    /* no transcript, no summary */
  }
  return "";
}

const prompt = first(payload.prompt, payload.user_prompt, payload.userPrompt, payload.message, payload.input);
let summary = first(payload.last_assistant_message, payload.lastAssistantMessage, payload.summary);

if (command === "end" && !summary) {
  summary = await lastAssistantText(first(payload.transcript_path, payload.transcriptPath, payload.transcript));
}

const line = await apply(ledgerFile(root, terminal), command, { prompt, summary });
if (line) console.log(line);
