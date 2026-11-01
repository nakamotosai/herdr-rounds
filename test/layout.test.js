import test from "node:test";
import assert from "node:assert/strict";
import { fit, short, since, ago, isRunning, LINE, CJK } from "../mods/rounds/layout.js";

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

test("isRunning only trusts the newest round inside the grace window", () => {
  const now = 1_000_000_000_000;
  assert.equal(isRunning({ n: 3, startedAt: now - 1000, endedAt: null }, 2, 3, now), true);
  assert.equal(isRunning({ n: 2, startedAt: now - 1000, endedAt: null }, 1, 3, now), false); // not the newest
  assert.equal(isRunning({ n: 3, startedAt: now - 3600_000, endedAt: null }, 2, 3, now), false); // stale
  assert.equal(isRunning({ n: 3, startedAt: now - 1000, endedAt: now }, 2, 3, now), false); // closed
});
