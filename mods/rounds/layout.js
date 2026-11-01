// Pure helpers: no herdr imports, so they can be unit-tested with plain node.

/** px of text per wrapped line at 13.5px in a ~420px pane */
export const LINE = 420;
export const CJK = 14.6; // conservative: a CJK glyph at 13.5px plus letter spacing
export const LATIN = 7.4;

/** One short line of the person's own words — a title in the conversation's language. */
export function short(value, n = 30) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

/** Cuts to roughly `budget` px of text and marks the cut with an ellipsis. */
export function fit(text, budget = LINE * 3) {
  const raw = String(text ?? "");
  let used = 0;
  let out = "";
  for (const ch of raw) {
    used += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? CJK : LATIN;
    if (used > budget) return { text: `${out.trimEnd()}…`, cut: true };
    out += ch;
  }
  return { text: raw, cut: false };
}

/** How long a finished round took: "42s", "3m", "1h". */
export function ago(ms, t = (k, v) => k.replace("{n}", v)) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  if (s < 90) return t("dur.sec", s);
  const m = Math.round(s / 60);
  if (m < 90) return t("dur.min", m);
  return t("dur.hour", Math.round(m / 60));
}

/** When a round finished: "just now", "9m ago", "2h ago". */
export function since(ms, now = Date.now(), t = (k, v) => k.replace("{n}", v)) {
  if (!ms) return "";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return t("since.now");
  const m = Math.round(s / 60);
  if (m < 60) return t("since.min", m);
  const h = Math.round(m / 60);
  if (h < 24) return t("since.hour", h);
  return t("since.day", Math.round(h / 24));
}

/** A row without an end time is the round running now; anything older than the grace window is stale. */
export function isRunning(round, index, total, now = Date.now(), graceMs = 30 * 60 * 1000) {
  return !round?.endedAt && round?.n === total && now - (round?.startedAt ?? 0) < graceMs && index === total - 1;
}
