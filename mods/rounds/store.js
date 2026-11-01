// The panel's only data reading. The format is documented in CONTRACT.md:
//   <dir>/index.json              optional metadata per terminal
//   <dir>/rounds/<terminal>.jsonl one round per line
// Reading never throws: a missing or half-written file is an empty list.

import * as fs from "fs/promises";

/** One round, with every field the panel uses filled in. Unknown fields are dropped. */
export function normalizeRound(row) {
  const startedAt = Number(row?.startedAt) || 0;
  const endedAt = row?.endedAt ? Number(row.endedAt) : null;
  const durMs = Number(row?.durMs) || (endedAt && startedAt ? Math.max(0, endedAt - startedAt) : 0);
  return {
    n: Number(row?.n),
    prompt: String(row?.prompt ?? ""),
    summary: String(row?.summary ?? row?.said ?? ""),
    startedAt,
    endedAt,
    durMs,
    tools: Number(row?.tools) || 0,
    blocked: String(row?.blocked ?? ""),
    terminal: row?.terminal ? String(row.terminal) : "",
  };
}

/** Parses a jsonl file. Bad lines are skipped, unknown fields ignored, duplicate `n` keeps the last. */
export function parseRounds(text) {
  const byNumber = new Map();
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || typeof row !== "object" || typeof row.n !== "number" || !Number.isFinite(row.n)) continue;
    byNumber.set(row.n, normalizeRound(row));
  }
  return [...byNumber.values()].sort((a, b) => a.n - b.n);
}

export async function readRounds(dir, key) {
  if (!dir || !key) return [];
  try {
    return parseRounds(await fs.readFile(`${dir}/rounds/${key}.jsonl`, "utf8"));
  } catch {
    return [];
  }
}

export async function readIndex(dir) {
  if (!dir) return {};
  try {
    const parsed = JSON.parse(await fs.readFile(`${dir}/index.json`, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Whether the directory even exists — distinguishes "no adapter installed" from "empty conversation". */
export async function hasSource(dir) {
  if (!dir) return false;
  try {
    await fs.stat(`${dir}/rounds`);
    return true;
  } catch {
    return false;
  }
}

export function totalMs(rounds) {
  return rounds.reduce((sum, row) => sum + (row.durMs || 0), 0);
}
