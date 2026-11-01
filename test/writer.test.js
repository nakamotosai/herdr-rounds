import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseRounds } from "../mods/rounds/store.js";

const run = promisify(execFile);

async function cli(dir, args) {
  return run(process.execPath, ["bin/rounds-write.mjs", ...args], {
    cwd: path.resolve("."),
    env: { ...process.env, HERDR_ROUNDS_DIR: dir },
  });
}

test("start / step / end produce one contract-valid round", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rounds-cli-"));
  await cli(dir, ["start", "--terminal", "t9", "--prompt", "make the button blue"]);
  await cli(dir, ["step", "--terminal", "t9"]);
  await cli(dir, ["step", "--terminal", "t9"]);
  await cli(dir, ["end", "--terminal", "t9", "--summary", "Done: it is blue."]);

  const rows = parseRounds(await fs.readFile(path.join(dir, "rounds", "t9.jsonl"), "utf8"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prompt, "make the button blue");
  assert.equal(rows[0].summary, "Done: it is blue.");
  assert.equal(rows[0].tools, 2);
  assert.ok(rows[0].endedAt > 0);

  // a second instruction opens round 2 and closes nothing else
  await cli(dir, ["start", "--terminal", "t9", "--prompt", "now make it round"]);
  const again = parseRounds(await fs.readFile(path.join(dir, "rounds", "t9.jsonl"), "utf8"));
  assert.deepEqual(again.map((row) => row.n), [1, 2]);
  assert.equal(again[1].endedAt, null);
  await fs.rm(dir, { recursive: true, force: true });
});
