import test from "node:test";
import assert from "node:assert/strict";
import { pickLocale, setLocale, getLocale, t, locales } from "../mods/rounds/i18n.js";

test("pickLocale prefers the first recognised tag", () => {
  assert.equal(pickLocale("zh-CN"), "zh");
  assert.equal(pickLocale(["fr-FR", "en-US"]), "en");
  assert.equal(pickLocale(undefined), "en");
});

test("t switches tables and fills variables", () => {
  setLocale("en");
  assert.equal(t("send.button"), "Send");
  assert.equal(t("since.min", { n: 9 }), "9m ago");
  setLocale("zh");
  assert.equal(t("send.button"), "发送");
  assert.equal(t("since.min", { n: 9 }), "9分钟前");
  assert.equal(t("no.such.key"), "no.such.key");
  assert.deepEqual(locales().sort(), ["en", "zh"]);
  setLocale(null); // back to detection
  assert.ok(["en", "zh"].includes(getLocale()));
});
