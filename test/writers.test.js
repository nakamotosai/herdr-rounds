// The writers every integration funnels through: the CLI, the stdin hook, and the wrapper.

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin");

function run(script, args, env, stdin) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [path.join(bin, script), ...args], {
      env: { ...process.env, ...env },
    });
    let out = "";
    child.stdout?.on("data", (chunk) => (out += chunk));
    child.stderr?.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => resolve({ code, out }));
    if (stdin !== undefined) child.stdin?.end(stdin);
  });
}

const rows = async (dir, terminal) =>
  (await readFile(path.join(dir, "rounds", `${terminal}.jsonl`), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

test("the CLI writer opens, counts and closes one round", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rounds-w-"));
  const env = { HERDR_ROUNDS_DIR: dir, HC_TERMINAL_ID: "tW" };
  await run("rounds-write.mjs", ["start", "--prompt", "make it blue"], env);
  await run("rounds-write.mjs", ["step"], env);
  await run("rounds-write.mjs", ["end", "--summary", "It is blue."], env);
  const [round] = await rows(dir, "tW");
  assert.equal(round.prompt, "make it blue");
  assert.equal(round.tools, 1);
  assert.equal(round.summary, "It is blue.");
  assert.ok(round.endedAt);
});

test("the stdin hook reads the payload a CLI sends", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rounds-h-"));
  const env = { HERDR_ROUNDS_DIR: dir, HC_TERMINAL_ID: "tH" };
  await run("rounds-hook.mjs", ["start"], env, JSON.stringify({ prompt: "fix the import" }));
  await run("rounds-hook.mjs", ["end"], env, JSON.stringify({ last_assistant_message: "Done: import fixed." }));
  const [round] = await rows(dir, "tH");
  assert.equal(round.prompt, "fix the import");
  assert.equal(round.summary, "Done: import fixed.");
});

test("the hook falls back to the transcript for the closing line", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rounds-t-"));
  const transcript = path.join(dir, "session.jsonl");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    transcript,
    [
      JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "All tests pass." }] } }),
    ].join("\n") + "\n",
  );
  const env = { HERDR_ROUNDS_DIR: dir, HC_TERMINAL_ID: "tT" };
  await run("rounds-hook.mjs", ["start"], env, JSON.stringify({ prompt: "run the tests" }));
  await run("rounds-hook.mjs", ["end"], env, JSON.stringify({ transcript_path: transcript }));
  const [round] = await rows(dir, "tT");
  assert.equal(round.summary, "All tests pass.");
});

test("the hook does nothing outside a herdr terminal", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rounds-n-"));
  const env = { HERDR_ROUNDS_DIR: dir, HC_TERMINAL_ID: "" };
  const result = await run("rounds-hook.mjs", ["start"], env, JSON.stringify({ prompt: "x" }));
  assert.equal(result.code, 0);
  await assert.rejects(readFile(path.join(dir, "rounds", ".jsonl"), "utf8"));
});
