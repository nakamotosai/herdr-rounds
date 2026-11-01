import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseRounds, normalizeRound, readRounds, readIndex, hasSource, totalMs } from "../mods/rounds/store.js";

test("parseRounds skips bad lines, keeps the last duplicate and sorts", () => {
  const text = [
    JSON.stringify({ n: 2, prompt: "second", startedAt: 2, endedAt: 3 }),
    "not json",
    JSON.stringify({ n: 1, prompt: "first", startedAt: 1, endedAt: 2 }),
    JSON.stringify({ prompt: "no round number" }),
    JSON.stringify({ n: 2, prompt: "second (rewritten)", startedAt: 2, endedAt: 4 }),
  ].join("\n");
  const rows = parseRounds(text);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.n), [1, 2]);
  assert.equal(rows[1].prompt, "second (rewritten)");
  assert.equal(rows[1].durMs, 2);
});

test("unknown fields are dropped and missing ones defaulted", () => {
  const row = normalizeRound({ n: 7, prompt: "x", somethingElse: 1, tools: "3" });
  assert.equal(row.terminal, "");
  assert.equal(row.summary, "");
  assert.equal(row.tools, 3);
  assert.equal(row.endedAt, null);
  assert.equal("somethingElse" in row, false);
});

test("a half-written file still yields its whole lines", () => {
  const rows = parseRounds(`${JSON.stringify({ n: 1, prompt: "ok", startedAt: 1, endedAt: 2 })}\n{"n":2,"prompt":"cut`);
  assert.equal(rows.length, 1);
});

test("reading a missing folder is empty, not an error", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rounds-"));
  assert.deepEqual(await readRounds(dir, "t1"), []);
  assert.deepEqual(await readIndex(dir), {});
  assert.equal(await hasSource(dir), false);
  await fs.mkdir(path.join(dir, "rounds"));
  await fs.writeFile(path.join(dir, "rounds", "t1.jsonl"), `${JSON.stringify({ n: 1, startedAt: 1, endedAt: 3, prompt: "p" })}\n`);
  await fs.writeFile(path.join(dir, "index.json"), JSON.stringify({ t1: { title: "demo" } }));
  assert.equal(await hasSource(dir), true);
  const rows = await readRounds(dir, "t1");
  assert.equal(rows.length, 1);
  assert.equal(totalMs(rows), 2);
  assert.equal((await readIndex(dir)).t1.title, "demo");
  await fs.rm(dir, { recursive: true, force: true });
});
