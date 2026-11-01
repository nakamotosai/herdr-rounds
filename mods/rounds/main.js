// rounds — one line per instruction, for the conversation this tab is showing.
//
// A round is what you asked and what that turn got done, in plain words. The panel follows the
// tab you are looking at, so switching tabs switches conversations; it never mixes them.
//
// It reads only <home>/.herdr-rounds (see CONTRACT.md). No network, no telemetry.
// Cards show at most three text lines; click one to read it whole.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Input, InputState } from "gpui-base";
import {
  theme, home, focused, spaces, panes, props, closeOverlay, watchFolder, hc, run, shared, setShared, exec,
} from "herdr";
import { fit, short, since, ago, isRunning, liveState, sessionIdFromPath, LINE } from "./layout.js";
import { readIndex, readRounds, hasSource, totalMs } from "./store.js";
import { t, getLocale, setLocale, locales } from "./i18n.js";

/** layout.js helpers take `(key, n)`; the i18n `t` takes `(key, vars)`. */
const fmt = (key, n) => t(key, { n });

const POLL_MS = 4000;
const LEASE_MS = 30000; // how long a session-lease answer is reused
const TAIL = 6; // the newest rounds that fit above the composer; older ones are counted, not drawn
const NAME_TABS = true; // name an unnamed tab after its conversation; a typed name is never touched

export default class Rounds extends View {
  init(_props, cx) {
    this.key = null;
    this.entry = null;
    this.rounds = [];
    this.err = null;
    this.source = true;
    this.expanded = new Set();
    this.terminal = null;
    this.state = "unknown"; // live / ended / stale / unknown, for the newest round
    this.lease = null;
    this.dir = `${(home() || "").replace(/\\/g, "/")}/.herdr-rounds`;

    this.input = InputState.new({ placeholder: t("tab.prompt") });
    this.input.on("submit", (_event, inner) => this.send(inner));

    this.load(cx);
    cx.timer.every(POLL_MS, (inner) => this.load(inner));
    cx.spawn(async (inner) => {
      for (;;) {
        try {
          await watchFolder(this.dir);
          await this.load(inner);
          inner.notify();
        } catch {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      }
    });
  }

  /** The conversation's own title: a curated one first, else the person's first instruction. */
  tabTitle(entry, tab) {
    const firstPrompt = this.rounds[0]?.prompt ?? "";
    return entry?.title || (firstPrompt ? short(firstPrompt, 20) : "") || tab?.name || this.key || "";
  }

  /** Names an unnamed tab after the conversation, and follows the title it set itself.
   *  A name the person typed is never touched. */
  nameTab(tab, title) {
    if (!NAME_TABS || !tab || !title) return;
    const ours = shared(`rounds.tab.${tab.id}`);
    const fresh = tab.named !== true;
    if (!fresh && ours !== tab.name) return;
    const wanted = short(title, 20);
    if (!wanted || wanted === tab.name) return;
    run("tab.rename", { id: tab.id, name: wanted });
    setShared(`rounds.tab.${tab.id}`, wanted);
  }

  /** The terminal the active tab actually shows. `focused()` alone can point at the last
   *  terminal focused in another tab, which would show the wrong conversation. */
  visibleTerminal() {
    const f = focused();
    const space = spaces().find((s) => s.active) ?? spaces().find((s) => s.id === f?.space);
    const tab = space?.tabs?.find((item) => item.active) ?? space?.tabs?.find((item) => item.id === f?.tab);
    const list = tab ? panes().filter((pane) => pane.tab === tab.id && pane.terminal) : [];
    // A mod pane (this panel) has no terminal, and `focused()` is empty while it holds focus.
    const pane = list.find((item) => item.focused) ?? list[0];
    return { terminal: pane?.terminal ?? f?.terminal ?? null, tab, space };
  }

  send(cx) {
    const text = String(this.input?.value?.() ?? "").trim();
    const target = this.terminal;
    if (!text || !target) {
      cx?.notify?.();
      return;
    }
    this.input.set_value("");
    hc(["send", target, text]).catch(() => {});
    cx?.notify?.();
  }

  cycleLocale(cx) {
    const list = locales();
    const next = list[(list.indexOf(getLocale()) + 1) % list.length];
    setLocale(next);
    this.input.set_value(this.input.value()); // keep whatever is typed
    cx?.notify?.();
  }

  /** Is the conversation still being written? A fresh heartbeat answers it for free; when the
   *  heartbeat is missing or stale, ask omp whether a live process holds the session. */
  async liveness(entry) {
    const state = liveState(entry, Date.now());
    if (state === "live" || state === "ended") return state;
    const id = String(entry?.sessionId ?? "") || sessionIdFromPath(entry?.sessionPath);
    if (!id || typeof exec !== "function") return state;
    const cached = this.lease;
    if (cached && cached.id === id && Date.now() - cached.at < LEASE_MS) return cached.state;
    try {
      const r = await exec("omp", ["session", "lease", "--json", "--", id]);
      const answer = JSON.parse(String(r?.stdout ?? "{}"));
      const next = Array.isArray(answer?.held) && answer.held.includes(id) ? "live" : "ended";
      this.lease = { id, at: Date.now(), state: next };
      return next;
    } catch {
      return state;
    }
  }

  async load(cx) {
    try {
      const { terminal, tab } = this.visibleTerminal();
      if (terminal) this.key = terminal;
      this.terminal = terminal;
      if (!this.key) {
        this.err = t("err.noTerminal");
        cx?.notify?.();
        return;
      }
      this.source = await hasSource(this.dir);
      const index = await readIndex(this.dir);
      this.entry = index[this.key] ?? null;
      this.rounds = await readRounds(this.dir, this.key);
      this.state = await this.liveness(this.entry);
      this.err = null;
      if (tab) this.nameTab(tab, this.tabTitle(this.entry, tab));
    } catch (error) {
      this.err = String(error?.message ?? error);
    }
    cx?.notify?.();
  }

  line(c, label, text, color, size = 13.5, lines = 2) {
    if (!text) return null;
    return h_flex().w_full().items_start().gap(8)
      .child(div().w(42).flex_none().pt(1).text_size(10.5).text_color(c.dim).child(label))
      .child(div().flex_1().min_w(0).whitespace_normal().text_size(size).line_height(1.5).text_color(color)
        // The pane can be narrower than `fit` assumed, so the height is capped too.
        .max_h(Math.round(lines * size * 1.5)).overflow_hidden().child(text));
  }

  row(c, round, index) {
    const open = isRunning(round, index, this.rounds.length, this.state);
    const expanded = this.expanded.has(round.n);
    const body = round.summary || "";
    const promptFit = expanded ? { text: round.prompt, cut: false } : fit(round.prompt, LINE);
    const bodyFull = body || (open ? (round.doing || t("run.now")) : t("run.noText"));
    const bodyFit = expanded ? { text: bodyFull, cut: false } : fit(bodyFull, LINE * 2);
    const more = !expanded && (promptFit.cut || bodyFit.cut);

    const head = h_flex().w_full().items_center().gap(8)
      .child(div().w(22).h(19).flex_none().rounded(4).bg(open ? `${c.working}26` : c.raised)
        .flex().items_center().justify_center().text_size(11).font_bold()
        .text_color(open ? c.working : c.muted).child(String(round.n)))
      .child(open
        ? svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(c.working).spin(900)
        : div().size(7).flex_none().rounded(4).bg(c.done))
      .child(div().flex_1().text_size(11.2).text_color(c.muted)
        .child(`${t("meta.steps", { n: round.tools ?? 0 })}${round.durMs ? ` · ${ago(round.durMs, fmt)}` : ""}`))
      .child(div().text_size(10.5).text_color(open ? c.working : c.dim)
        .child(open ? t("run.active") : since(round.endedAt, Date.now(), fmt)));

    return v_flex()
      .w_full().gap(4).px(11).py(9).rounded(6)
      .bg(open ? `${c.working}0f` : c.raised)
      .border(1).border_color(open ? `${c.working}55` : c.border)
      .cursor_pointer()
      .on_click((_event, cx) => {
        cx?.stop_propagation?.();
        if (this.expanded.has(round.n)) this.expanded.delete(round.n);
        else this.expanded.add(round.n);
        cx?.notify?.();
      })
      .child(head)
      .child(this.line(c, t("you"), promptFit.text, c.muted, 13.5, 1))
      .child(this.line(c, t("round"), bodyFit.text, body ? c.foreground : c.dim, 13.5, 2))
      .when(more, (el) => el.child(div().pl(50).text_size(10.5).text_color(c.dim).child(t("card.more"))));
  }

  emptyState(c) {
    if (!this.source) {
      return v_flex().gap(5)
        .child(div().text_size(12.5).text_color(c.muted).child(t("empty.adapter")))
        .child(div().text_size(11.5).text_color(c.dim).child("CONTRACT.md · adapters/omp"));
    }
    return v_flex().gap(5)
      .child(div().text_size(12.5).text_color(c.muted).child(t("empty.rows")))
      .child(div().text_size(11.5).text_color(c.dim).child(t("empty.hint")))
      .child(div().text_size(11).text_color(c.dim).child(t("empty.scope")));
  }

  render() {
    const colors = theme();
    const { terminal, tab } = this.visibleTerminal();
    const key = terminal ?? this.key;
    const title = this.tabTitle(this.entry, tab) || t("title.fallback");
    const subtitle = this.entry?.subtitle && this.entry.subtitle !== title ? String(this.entry.subtitle) : "";
    const meta = [
      key,
      tab?.name,
      this.rounds.length ? t("meta.rounds", { n: this.rounds.length }) : "",
      totalMs(this.rounds) ? ago(totalMs(this.rounds), fmt) : "",
    ].filter(Boolean).join(" · ");

    const head = h_flex().w_full().items_start().gap(8)
      .child(v_flex().flex_1().gap(1)
        .child(div().text_size(15).font_semibold().child(title))
        .when(Boolean(subtitle), (el) => el.child(div().text_size(11).text_color(colors.dim).child(subtitle)))
        .child(div().text_size(11).text_color(colors.muted).child(meta)))
      .child(div().flex_none().px(5).py(1).rounded(4).cursor_pointer().text_size(10.5)
        .text_color(colors.dim).hover((s) => s.bg(colors.hover)).child(getLocale().toUpperCase())
        .on_click((_event, cx) => this.cycleLocale(cx)))
      .when(Boolean(props()?.overlay), (el) => el.child(div().text_size(12).text_color(colors.dim).cursor_pointer()
        .on_click(() => closeOverlay(props().overlay)).child("✕")));

    const body = [];
    if (this.err) body.push(div().text_size(12).text_color(colors.blocked).child(this.err));
    if (!this.err && !this.rounds.length) body.push(this.emptyState(colors));
    // Oldest at the top, newest at the bottom: the panel reads like a conversation, and the round
    // still running sits right above the composer.
    const from = Math.max(0, this.rounds.length - TAIL);
    if (from > 0) {
      body.push(div().py(2).text_size(10.5).text_color(colors.dim).child(t("more.earlier", { n: from })));
    }
    this.rounds.forEach((round, index) => {
      if (index >= from) body.push(this.row(colors, round, index));
    });

    const composer = h_flex().w_full().items_center().gap(6)
      .child(Input.new(this.input).flex_1().min_w(0).h(32).px(10).rounded(7)
        .border(1).border_color(this.terminal ? colors.input : colors.border).bg(colors.background)
        .text_size(12.5).text_color(colors.foreground))
      .child(div().flex_none().h(32).px(12).rounded(7).flex().items_center().justify_center()
        .bg(this.terminal ? colors.accent : colors.raised)
        .text_color(this.terminal ? colors.accent_foreground : colors.dim)
        .text_size(12).cursor_pointer()
        .hover((s) => s.opacity(0.85))
        .on_click((_event, cx) => this.send(cx))
        .child(this.terminal ? t("send.button") : t("send.noTerminal")));

    return v_flex().size_full().bg(colors.background).text_color(colors.foreground).p(12).gap(8)
      .child(head)
      .child(v_flex().flex_1().min_h(0).gap(6).overflow_y_scrollbar().children(body))
      .child(composer);
  }
}
