// The omp adapter, driven through a fake `pi` and a real session file: what it reads from the
// transcript, what it writes into the ledger, and what it says about being alive.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const strip = process.features?.typescript; // node >= 22.18 strips types on its own

function slot(title) {
  const base = JSON.stringify({ type: "title", v: 1, title, source: "auto" });
  return `${base.padEnd(255, " ")}\n`;
}

const SESSION = [
  slot("Ship the send button"),
  JSON.stringify({ type: "session", version: 3, id: "01a192f6-445e-76d5-bc24-0af9fb25f4cf" }),
  JSON.stringify({
    type: "message",
    timestamp: "2026-11-01T10:00:00.000Z",
    message: { role: "user", content: [{ type: "text", text: "make the send button work" }] },
  }),
  JSON.stringify({
    type: "message",
    timestamp: "2026-11-01T10:00:20.000Z",
    message: {
      role: "assistant",
      content: [
        { type: "toolCall", name: "read", input: {} },
        { type: "toolCall", name: "edit", input: {} },
        { type: "text", text: "Wired the button to the same path as Enter." },
      ],
    },
  }),
  JSON.stringify({
    type: "message",
    timestamp: "2026-11-01T10:01:00.000Z",
    message: { role: "user", content: [{ type: "text", text: "now name the tab" }] },
  }),
].join("\n") + "\n";

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), "rounds-"));
  const sessions = path.join(root, "sessions");
  await mkdir(sessions, { recursive: true });
  const file = path.join(sessions, "2026-11-01T09-59-00-000Z_01a192f6-445e-76d5-bc24-0af9fb25f4cf.jsonl");
  await writeFile(file, SESSION);

  process.env.HERDR_ROUNDS_DIR = path.join(root, "data");
  process.env.HC_TERMINAL_ID = "tTEST";
  delete process.env.PI_SESSION_FILE;

  const { default: adapter } = await import("../adapters/omp/rounds-omp.ts");
  const handlers = {};
  const pi = {
    on: (name, fn) => { handlers[name] = fn; },
    setLabel: () => {},
    registerCommand: () => {},
  };
  adapter(pi);
  const ctx = { cwd: "/work", sessionManager: { getSessionId: () => "01a192f6", getSessionFile: () => file } };
  const read = async (name) => JSON.parse(await readFile(path.join(root, "data", name), "utf8"));
  return { root, file, handlers, ctx, read };
}

test("the adapter derives rounds, keeps a heartbeat, and takes the title from the slot", { skip: !strip }, async () => {
  const { handlers, ctx, read } = await harness();
  await handlers.session_start({}, ctx);

  const rows = (await readFile(path.join(process.env.HERDR_ROUNDS_DIR, "rounds", "tTEST.jsonl"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(rows.length, 2, "two instructions, two rounds");
  assert.equal(rows[0].prompt, "make the send button work");
  assert.equal(rows[0].tools, 2);
  assert.equal(rows[0].summary, "Wired the button to the same path as Enter.");
  assert.ok(rows[0].endedAt, "the second instruction closes the first round");
  assert.ok(rows[1].endedAt, "a rebuilt ledger closes the round the transcript left open");

  const index = await read("index.json");
  assert.equal(index.tTEST.sessionId, "01a192f6");
  assert.equal(index.tTEST.subtitle, "Ship the send button", "title comes from the fixed-width slot");
  assert.equal(index.tTEST.live, true);
  assert.ok(index.tTEST.hb > 0, "a heartbeat the panel can trust");
});

test("a live line lands on the open round and goes away when it closes", { skip: !strip }, async () => {
  const { handlers, ctx, read, file } = await harness();
  await handlers.session_start({}, ctx);

  // The next instruction opens a round the transcript has not closed yet.
  await writeFile(file, JSON.stringify({
    type: "message",
    timestamp: "2026-11-01T10:05:00.000Z",
    message: { role: "user", content: [{ type: "text", text: "add a language switch" }] },
  }) + "\n", { flag: "a" });
  await handlers.message_end({}, ctx);

  let open = (await readFile(path.join(process.env.HERDR_ROUNDS_DIR, "rounds", "tTEST.jsonl"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(open.length, 3);
  assert.equal(open[2].endedAt, null, "a new instruction starts an open round");

  await handlers.retry_fallback_applied({ to: "kimi-k3.1-pro" });

  let rows = (await readFile(path.join(process.env.HERDR_ROUNDS_DIR, "rounds", "tTEST.jsonl"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(rows[2].doing, "retrying on kimi-k3.1-pro");

  await handlers.agent_end({}, ctx);
  rows = (await readFile(path.join(process.env.HERDR_ROUNDS_DIR, "rounds", "tTEST.jsonl"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(rows[2].doing, "", "a closed round has no live line");
  assert.ok(rows[2].endedAt);

  const index = await read("index.json");
  assert.equal(index.tTEST.live, true, "the process is still up after a turn ends");
});

test("shutdown tells the panel the conversation is over", { skip: !strip }, async () => {
  const { handlers, ctx, read } = await harness();
  await handlers.session_start({}, ctx);
  await handlers.session_shutdown({}, ctx);
  const index = await read("index.json");
  assert.equal(index.tTEST.live, false);
  assert.equal(index.tTEST.hb, 0);
});
