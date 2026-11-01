import test from "node:test";
import assert from "node:assert/strict";
import { fit, short, since, ago, isRunning, liveState, sessionIdFromPath, LINE, CJK } from "../mods/rounds/layout.js";

test("short keeps one line and marks the cut", () => {
  assert.equal(short("hello"), "hello");
  assert.equal(short("a".repeat(30), 10), `${"a".repeat(9)}…`);
  assert.equal(short("  a\n b "), "a b");
});

test("fit counts CJK wider than latin and marks the cut", () => {
  const wide = fit("汉".repeat(100), LINE);
  assert.equal(wide.cut, true);
  assert.ok(wide.text.endsWith("…"));
  assert.ok(wide.text.length < 40, `kept ${wide.text.length} chars, budget is one line`);
  const narrow = fit("ab", LINE);
  assert.deepEqual(narrow, { text: "ab", cut: false });
  // the same char count of latin fits in more characters than of CJK
  const latinFit = fit("a".repeat(200), LINE);
  assert.ok(latinFit.text.length > wide.text.length);
  assert.ok(CJK > 10);
});

test("since and ago speak both languages", () => {
  const now = 1_000_000_000_000;
  const zh = (key, n) => ({ "since.now": "刚刚", "since.min": `${n}分钟前` }[key] ?? key);
  const en = (key, n) => ({ "since.now": "just now", "since.min": `${n}m ago` }[key] ?? key);
  assert.equal(since(now - 5_000, now, zh), "刚刚");
  assert.equal(since(now - 5 * 60_000, now, en), "5m ago");
  assert.equal(ago(42_000, (key, n) => (key === "dur.sec" ? `${n}s` : key)), "42s");
  assert.equal(ago(0), "");
});

test("liveState reads the writer's heartbeat, not the clock alone", () => {
  const now = 1_000_000_000_000;
  assert.equal(liveState({ live: true, hb: now - 2_000 }, now), "live");
  assert.equal(liveState({ live: true, hb: now - 60_000 }, now), "stale");
  assert.equal(liveState({ live: false, hb: 0 }, now), "ended");
  assert.equal(liveState({}, now), "unknown"); // a writer that never sent a heartbeat
  assert.equal(liveState(null, now), "unknown");
});

test("isRunning needs an open newest round and a writer that is still alive", () => {
  assert.equal(isRunning({ n: 3, endedAt: null }, 2, 3, "live"), true);
  assert.equal(isRunning({ n: 3, endedAt: null }, 2, 3, "unknown"), true); // no heartbeat to trust
  assert.equal(isRunning({ n: 3, endedAt: null }, 2, 3, "stale"), false); // the writer went away
  assert.equal(isRunning({ n: 3, endedAt: null }, 2, 3, "ended"), false);
  assert.equal(isRunning({ n: 2, endedAt: null }, 1, 3, "live"), false); // not the newest
  assert.equal(isRunning({ n: 3, endedAt: 5 }, 2, 3, "live"), false); // closed
});

test("sessionIdFromPath reads the id off the file name on either separator", () => {
  assert.equal(sessionIdFromPath("C:/x/2026-10-31T17-16-15-326Z_01a192f6.jsonl"), "01a192f6");
  assert.equal(sessionIdFromPath("/home/a/sessions/-x/2026-11-01T00-00-00-000Z_abc.jsonl"), "abc");
  assert.equal(sessionIdFromPath(""), "");
});
