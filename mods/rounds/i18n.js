// Two string tables and a detector. English is the default; a zh locale picks Chinese.
// No herdr imports: `pickLocale()` only reads Intl, so the tables stay testable.

const EN = {
  "title.fallback": "Progress",
  "tab.prompt": "Say it here — Enter sends it to this conversation…",
  "send.button": "Send",
  "send.noTerminal": "no terminal",
  "run.active": "running",
  "run.now": "Working…",
  "run.noText": "(no closing note for this round)",
  "card.more": "Tap to read it all",
  "more.earlier": "Show {n} earlier rounds",
  "more.collapse": "Show fewer",
  "you": "you",
  "round": "did",
  "empty.rows": "Nothing recorded for this conversation yet.",
  "empty.hint": "The first message you send shows up here immediately; an agent's earlier history is rebuilt when its session starts.",
  "empty.adapter": "No data source found. Install the adapter for your agent — see CONTRACT.md in the repo.",
  "empty.scope": "Each conversation shows only its own rounds.",
  "err.noTerminal": "No terminal in this tab yet.",
  "meta.rounds": "{n} rounds",
  "meta.steps": "{n} steps",
  "dur.sec": "{n}s",
  "dur.min": "{n}m",
  "dur.hour": "{n}h",
  "since.now": "just now",
  "since.min": "{n}m ago",
  "since.hour": "{n}h ago",
  "since.day": "{n}d ago",
  "tab.meta": "{n}",
};

const ZH = {
  "title.fallback": "进度",
  "tab.prompt": "在这里直接说，回车发到这个对话…",
  "send.button": "发送",
  "send.noTerminal": "未定位",
  "run.active": "进行中",
  "run.now": "正在做…",
  "run.noText": "（这轮没有文字汇报）",
  "card.more": "点击展开全文",
  "more.earlier": "展开更早 {n} 轮",
  "more.collapse": "收起",
  "you": "你",
  "round": "这轮",
  "empty.rows": "这个对话还没有记录。",
  "empty.hint": "发出第一条消息后，这里会立刻出现这一轮；旧的历史在会话启动时会自动从转录重建。",
  "empty.adapter": "没有找到数据源。给你的 agent 装上适配器——见仓库里的 CONTRACT.md。",
  "empty.scope": "每个对话只看自己的记录，不串台。",
  "err.noTerminal": "这个标签页里还没有终端。",
  "meta.rounds": "{n}轮",
  "meta.steps": "{n}步",
  "dur.sec": "{n}秒",
  "dur.min": "{n}分",
  "dur.hour": "{n}小时",
  "since.now": "刚刚",
  "since.min": "{n}分钟前",
  "since.hour": "{n}小时前",
  "since.day": "{n}天前",
  "tab.meta": "{n}",
};

const TABLES = { en: EN, zh: ZH };
let current = null;

/** `zh` for anything that resolves to Chinese, `en` otherwise. An explicit choice wins. */
export function pickLocale(locales) {
  const list = Array.isArray(locales) ? locales : [locales];
  for (const item of list) {
    const tag = String(item ?? "").toLowerCase();
    if (tag.startsWith("zh")) return "zh";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

export function detectLocale() {
  try {
    return pickLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return "en";
  }
}

export function setLocale(locale) {
  current = TABLES[locale] ? locale : null;
  return getLocale();
}

export function getLocale() {
  return current ?? detectLocale();
}

export function t(key, vars) {
  const table = TABLES[getLocale()] ?? EN;
  const template = table[key] ?? EN[key] ?? key;
  if (vars == null) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

export function locales() {
  return Object.keys(TABLES);
}
