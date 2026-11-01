// The ledger operations shared by the two CLI writers. No policy, no I/O beyond the file:
// `start` opens a round, `step` counts an action, `end` closes it with a summary.

import fs from "node:fs/promises";
import path from "node:path";

export function ledgerFile(root, terminal) {
  return path.join(root, "rounds", `${terminal}.jsonl`);
}

export async function readLedger(file) {
  try {
    return (await fs.readFile(file, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((row) => row && typeof row.n === "number");
  } catch {
    return [];
  }
}

export async function writeLedger(file, rows) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

export function openRound(rows) {
  const last = rows.at(-1);
  return last && !last.endedAt ? last : null;
}

/** Applies one command to a ledger in place. Returns a short line for the caller to print. */
export async function apply(file, command, { prompt = "", summary = "", doing = "" } = {}) {
  const rows = await readLedger(file);
  const open = openRound(rows);
  const now = Date.now();

  if (command === "start") {
    const text = String(prompt).replace(/\s+/g, " ").trim().slice(0, 200);
    if (!text) return "";
    if (open) {
      open.endedAt = now;
      open.durMs = Math.max(0, now - open.startedAt);
      open.doing = "";
    }
    rows.push({
      n: rows.length + 1,
      prompt: text,
      startedAt: now,
      endedAt: null,
      durMs: 0,
      tools: 0,
      summary: "",
      doing: "",
    });
    await writeLedger(file, rows);
    return `started round ${rows.length}`;
  }

  if (command === "step") {
    if (!open) return "";
    open.tools = (open.tools ?? 0) + 1;
    await writeLedger(file, rows);
    return "";
  }

  if (command === "doing") {
    if (!open) return "";
    const text = String(doing).replace(/\s+/g, " ").trim().slice(0, 40);
    if (!text || open.doing === text) return "";
    open.doing = text;
    await writeLedger(file, rows);
    return "";
  }

  if (command === "end") {
    if (!open) return "";
    open.summary = String(summary).replace(/\s+/g, " ").trim().slice(0, 200);
    open.endedAt = now;
    open.durMs = Math.max(0, now - open.startedAt);
    open.doing = "";
    await writeLedger(file, rows);
    return `closed round ${open.n}`;
  }

  return "";
}
