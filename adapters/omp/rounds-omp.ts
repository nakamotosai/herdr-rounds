// rounds — an omp adapter: one line per instruction so the herdr "rounds" panel can show what a
// conversation has been doing, in plain language: what you asked, what that round got done.
//
// The transcript is the only source. Rounds are derived from it incrementally (a byte offset),
// so a closing message that lands late, a compaction, or a restart cannot leave a round blank.
//
// Written for omp: drop in ~/.omp/agent/extensions/fleet-rounds.ts
// Writes (nothing else):
//   <dir>/index.json            terminal -> session file, title, round count
//   <dir>/rounds/<key>.jsonl    one record per round (CONTRACT.md)
//   <dir>/rounds/<key>.md       the last 20 rounds, readable
//   hc label <terminal> round=… doing=… hb=…   (only inside a herdr-core terminal)
//
// <dir> is $HERDR_ROUNDS_DIR, else ~/.herdr-rounds. An older ~/.omp/fleet is copied over once.
//
// Everything is wrapped in try/catch: a broken recorder must never disturb a session.

import { copyFile, mkdir, open as openFile, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import os from "node:os";

const MAX_MD_ROUNDS = 20;
const KEEP = 160; // characters kept from the user's instruction
const SUMMARY = 140; // characters kept from the round's wrap-up
const TICK_MS = 2000;

/** @param {unknown} value @param {number} n */
function cut(value, n = KEEP) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

/** One readable line: no code fences, no tables, no markdown — the model's own words. */
function humanize(value, n = SUMMARY) {
  let text = String(value ?? "");
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.split("\n").filter((line) => !line.trim().startsWith("|")).join(" ");
  text = text.replace(/`[^`]*`/g, " ").replace(/[*_#>]+/g, " ");
  text = text.replace(/^[-–•⚠️\s]+/gm, " ");
  text = text.replace(/\(\s*\)/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  let out = "";
  for (const sentence of text.split(/(?<=[。!?！?])/).filter((item) => item.trim()).slice(0, 2)) {
    if (out && out.length + sentence.length > n) break;
    out += sentence;
  }
  out = out.trim() || text.slice(0, n);
  return out.length > n ? `${out.slice(0, n - 1)}…` : out;
}

/** What the person typed, without the transport envelope a remote sender wraps around it. */
function cleanPrompt(value) {
  return String(value ?? "")
    .replace(/<hc\b[^>]*>[\s\S]*?<\/hc>/g, (match) => match.replace(/^<hc\b[^>]*>|<\/hc>$/g, ""))
    .replace(/^\s*\[Image\s*#[^\]]*\]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {any} message @param {string} role */
function textOf(message, role) {
  if (!message || message.role !== role) return "";
  if (typeof message.content === "string") return message.content.trim();
  const blocks = Array.isArray(message.content) ? message.content : [];
  return blocks
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join(" ")
    .trim();
}

export default function fleetRounds(pi) {
  const home = process.env.USERPROFILE || os.homedir();
  const root = process.env.HERDR_ROUNDS_DIR || path.join(home, ".herdr-rounds");
  const legacy = path.join(home, ".omp", "fleet");
  const roundsDir = path.join(root, "rounds");
  const terminal = process.env.HC_TERMINAL_ID || "";
  // Only the interactive session records. OMPCODE is 1 for it too, so it cannot be the test:
  // subagents nest their session file inside the parent's (`<parent>.jsonl\Name.jsonl`) and carry
  // no terminal id; print mode (`omp -p`) inherits both and must not write into a terminal's ledger.
  const printMode = process.argv.includes("-p") || process.argv.includes("--print");
  const nested = /\.jsonl[\\/]/.test(process.env.PI_SESSION_FILE ?? "") || !terminal || printMode;

  let sessionId = "";
  let sessionPath = "";
  let cwd = process.cwd();
  let key = terminal || "unknown";
  let title = "";
  let rows = [];
  let offset = 0;
  let partial = Buffer.alloc(0);
  let lastCompletedAt = 0;
  let busy = false;

  const ensureDirs = () => mkdir(roundsDir, { recursive: true });

  /** One-time move from the pre-open-source location, so history is not lost. */
  async function migrateLegacy() {
    try {
      await stat(roundsDir);
      return; // already has a data folder
    } catch {
      /* keep going */
    }
    try {
      await stat(legacy);
    } catch {
      return; // nothing to migrate
    }
    try {
      await mkdir(root, { recursive: true });
      for (const name of await readdir(path.join(legacy, "rounds"))) {
        await copyFile(path.join(legacy, "rounds", name), path.join(roundsDir, name));
      }
    } catch {
      /* ignore */
    }
    try {
      await copyFile(path.join(legacy, "index.json"), path.join(root, "index.json"));
    } catch {
      /* ignore */
    }
  }

  function renderMarkdown() {
    const head = `# ${terminal || key}${cwd ? ` · ${cwd}` : ""}`;
    const body = rows.slice(-MAX_MD_ROUNDS).map((row) => {
      const secs = Math.round((row.durMs ?? 0) / 1000);
      const lines = [
        `## ${row.n}轮 · ${new Date(row.startedAt).toLocaleTimeString()} · ${secs}s · ${row.tools}步`,
        `**你:** ${row.prompt}`,
        `**这轮:** ${row.summary || "（还没有文字汇报）"}`,
      ];
      if (row.blocked) lines.push(`**卡在:** ${row.blocked}`);
      return lines.join("\n");
    });
    return [head, "", ...body, ""].join("\n");
  }

  async function writeIndex(patch) {
    try {
      let index = {};
      try {
        index = JSON.parse(await readFile(path.join(root, "index.json"), "utf8"));
      } catch {
        index = {};
      }
      const entry = {
        ...(index[key] ?? {}),
        terminal,
        sessionId,
        sessionPath,
        cwd,
        updatedAt: Date.now(),
        ...patch,
      };
      if (!entry.title && title) entry.title = title;
      index[key] = entry;
      await writeFile(path.join(root, "index.json"), JSON.stringify(index, null, 2));
    } catch {
      /* ignore */
    }
  }

  async function writeLedger() {
    if (nested) return;
    try {
      await ensureDirs();
      await writeFile(
        path.join(roundsDir, `${key}.jsonl`),
        rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
      );
      await writeFile(path.join(roundsDir, `${key}.md`), renderMarkdown());
      await writeIndex({ rounds: rows.length });
      markLabel();
    } catch {
      /* ignore */
    }
  }

  function markLabel() {
    const row = rows.at(-1);
    if (!terminal || !row) return;
    try {
      const child = execFile(
        "hc",
        ["label", terminal, `round=${row.n}`, `doing=${cut(row.summary || "", 40)}`, `hb=${Math.floor(Date.now() / 1000)}`],
        { windowsHide: true },
        () => {},
      );
      child.on?.("error", () => {});
    } catch {
      /* ignore */
    }
  }

  /** Folds one transcript record into the rounds. Returns true when the ledger changed. */
  function consume(line) {
    if (!line.trim() || !line.includes('"type"')) return false;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      return false;
    }
    if (record.type === "title" || record.type === "title_change") {
      if (record.title) title = String(record.title).slice(0, 120);
      return false;
    }
    if (record.type !== "message") return false;

    const message = record.message ?? {};
    const when = Date.parse(record.timestamp ?? "") || 0;

    if (message.role === "user") {
      const typed = cleanPrompt(textOf(message, "user"));
      if (!typed) return false;
      const open = rows.at(-1);
      if (open && !open.endedAt && message.steering) {
        // A steering message is typed while the round is still running: the harness folds it
        // into that same turn, so the person counts it as part of the same round.
        if (!open.prompt.includes(typed)) open.prompt = cut(`${open.prompt} ${typed}`, 200);
        return true;
      }
      if (open && !open.endedAt) {
        // A normal message after an unfinished round means that round ended unannounced.
        open.endedAt = when || Date.now();
        open.durMs = Math.max(0, open.endedAt - open.startedAt);
      }
      rows.push({
        n: rows.length + 1,
        terminal,
        session: sessionId,
        sessionPath,
        cwd,
        prompt: cut(typed, KEEP),
        startedAt: when || Date.now(),
        endedAt: null,
        durMs: 0,
        tools: 0,
        summary: "",
        blocked: "",
      });
      return true;
    }

    if (message.role === "assistant") {
      const row = rows.at(-1);
      if (!row) return false;
      let changed = false;
      const blocks = Array.isArray(message.content) ? message.content : [];
      const calls = blocks.filter((block) => block && block.type === "toolCall").length;
      if (calls) {
        row.tools += calls;
        changed = true;
      }
      const said = textOf(message, "assistant");
      if (said) {
        row.summary = humanize(said);
        changed = true;
      }
      if (message.completedAt) lastCompletedAt = Number(message.completedAt) || lastCompletedAt;
      return changed;
    }

    return false;
  }

  /** Reads whatever the transcript appended since last time. `full` re-reads it from the start. */
  async function sync({ full = false } = {}) {
    if (nested || busy) return;
    busy = true;
    try {
      if (full) {
        rows = [];
        offset = 0;
        partial = Buffer.alloc(0);
        lastCompletedAt = 0;
      }
      if (!sessionPath) return;
      const info = await stat(sessionPath).catch(() => null);
      if (!info) return;
      if (info.size < offset) {
        rows = [];
        offset = 0;
        partial = Buffer.alloc(0);
      }
      if (info.size === offset) return;

      const handle = await openFile(sessionPath, "r");
      const length = info.size - offset;
      const buffer = Buffer.alloc(length);
      let read = 0;
      while (read < length) {
        const { bytesRead } = await handle.read(buffer, read, length - read, offset + read);
        if (!bytesRead) break;
        read += bytesRead;
      }
      await handle.close();
      offset += read;

      const chunk = Buffer.concat([partial, buffer.subarray(0, read)]);
      const lastNewline = chunk.lastIndexOf(0x0a);
      if (lastNewline === -1) {
        partial = chunk;
        return;
      }
      partial = Buffer.from(chunk.subarray(lastNewline + 1));
      let changed = false;
      for (const line of chunk.subarray(0, lastNewline).toString("utf8").split("\n")) {
        if (consume(line)) changed = true;
      }

      if (full) {
        // A rebuilt ledger closes its last round with the transcript's own end time,
        // since the events that would have closed it are long gone.
        const row = rows.at(-1);
        if (row && !row.endedAt) {
          row.endedAt = Math.max(lastCompletedAt || row.startedAt, row.startedAt);
          row.durMs = Math.max(0, row.endedAt - row.startedAt);
        }
        changed = true;
      }
      if (changed) await writeLedger();
    } catch {
      /* ignore */
    } finally {
      busy = false;
    }
  }

  async function closeOpenRound() {
    const row = rows.at(-1);
    if (!row || row.endedAt) return;
    row.endedAt = Date.now();
    row.durMs = Math.max(0, row.endedAt - row.startedAt);
    await writeLedger();
  }

  async function resolveKey(ctx) {
    try {
      sessionId = String(ctx?.sessionManager?.getSessionId?.() ?? sessionId ?? "");
      const file = ctx?.sessionManager?.getSessionFile?.();
      if (typeof file === "string" && file) sessionPath = file;
      if (typeof ctx?.cwd === "string" && ctx.cwd) cwd = ctx.cwd;
    } catch {
      /* ignore */
    }
    key = terminal || sessionId || "unknown";
  }

  pi.setLabel?.("Fleet rounds");

  pi.registerCommand("rounds-backfill", {
    description: "把这个对话的历史重建进进度记录（~/.omp/fleet）",
    handler: async (_args, ctx) => {
      await resolveKey(ctx);
      await sync({ full: true });
      await closeOpenRound();
      ctx?.ui?.notify?.(`已重建 ${rows.length} 轮`, "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    await ensureDirs();
    await migrateLegacy();
    await resolveKey(ctx);
    await sync({ full: true });
  });

  pi.on("session_switch", async (_event, ctx) => {
    await resolveKey(ctx);
    await sync({ full: true });
  });

  pi.on("message_end", async () => {
    await sync();
  });

  pi.on("tool_approval_requested", async (event) => {
    const row = rows.at(-1);
    if (!row) return;
    row.blocked = cut(event?.reason ?? "审批中", 60);
    await writeLedger();
  });

  pi.on("agent_end", async () => {
    await sync();
    await closeOpenRound();
  });

  pi.on("session_shutdown", async () => {
    await sync();
    await closeOpenRound();
  });

  if (!nested) {
    try {
      const timer = setInterval(() => void sync(), TICK_MS);
      timer?.unref?.();
    } catch {
      /* ignore */
    }
  }
}
