import test from "node:test";
import assert from "node:assert/strict";
import {
  MISSING,
  diffJson,
  encodePointer,
  mapSourcePathToTarget,
  valuesEqual,
} from "./translation-report-lib.mjs";

test("JSON Pointer escapes special characters without confusing dotted keys", () => {
  assert.equal(encodePointer(["16", "38.2", "a/b", "x~y"]), "/16/38.2/a~1b/x~0y");
});

test("source filenames map to language-specific target names", () => {
  assert.equal(
    mapSourcePathToTarget("data/EN/MapEventDialogueEN006.json", "EN", "KR"),
    "data/KR/MapEventDialogueKR006.json",
  );
  assert.equal(
    mapSourcePathToTarget("data/EN/systemFeatureText_EN.json", "EN", "KR"),
    "data/KR/systemFeatureText_KR.json",
  );
});

test("object key order does not count as a source change", () => {
  assert.equal(valuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
});

test("arrays are compared as atomic translation units", () => {
  const changes = diffJson(
    { item: { text: ["old line one", "old line two"] } },
    { item: { text: ["new combined line"] } },
    { item: { text: ["기존 번역"] } },
  );
  assert.deepEqual(changes, [{
    status: "changed",
    pointer: "/item/text",
    sourceBefore: ["old line one", "old line two"],
    sourceAfter: ["new combined line"],
    translationCurrent: ["기존 번역"],
  }]);
});

test("strings and string arrays are compatible translation text", () => {
  const changes = diffJson(
    { first: "Source line", second: ["Source", "line"] },
    { first: "Source line", second: ["Source", "line"] },
    { first: ["Translated", "line"], second: "Translated line" },
  );
  assert.deepEqual(changes, []);
});

test("typographic punctuation and line-wrap-only source edits are ignored", () => {
  const changes = diffJson(
    {
      description: ["A relic that turns touch to gold — the Bladekeepers’ ultimate dream…"],
      lineWrap: "A long English line",
    },
    {
      description: ["A relic that turns touch to gold - the Bladekeepers' ultimate dream..."],
      lineWrap: ["A long", "English line"],
    },
    {
      description: ["Translated description"],
      lineWrap: ["Translated line"],
    },
  );
  assert.deepEqual(changes, []);
});

test("meaningful punctuation and wording changes are still reported", () => {
  const changes = diffJson(
    { punctuation: "Are you ready.", wording: "Old wording" },
    { punctuation: "Are you ready?", wording: "New wording" },
    { punctuation: "Translated", wording: "Translated" },
  );
  assert.deepEqual(changes.map(({ status, pointer }) => ({ status, pointer })), [
    { status: "changed", pointer: "/punctuation" },
    { status: "changed", pointer: "/wording" },
  ]);
});

test("blank and null translations are missing instead of conflicting", () => {
  const changes = diffJson(
    { subtitle: ["Source", "line"], description: "Source description" },
    { subtitle: ["Source", "line"], description: "Source description" },
    { subtitle: "", description: null },
  );
  assert.deepEqual(changes.map(({ status, pointer }) => ({ status, pointer })), [
    { status: "missing", pointer: "/description" },
    { status: "missing", pointer: "/subtitle" },
  ]);
});

test("new entries only report meaningful untranslated text", () => {
  const changes = diffJson(
    {},
    {
      ability: "",
      beIndependent: true,
      description: ["English description"],
      name: ["English name"],
      needsTranslation: "New English text",
      subtitle: "",
    },
    {
      ability: "",
      beIndependent: true,
      description: ["Translated description"],
      name: ["Translated name"],
      subtitle: "",
    },
  );
  assert.deepEqual(changes.map(({ status, pointer }) => ({ status, pointer })), [{
    status: "added",
    pointer: "/needsTranslation",
  }]);
});

test("added, deleted, missing, and conflicts are classified", () => {
  const changes = diffJson(
    { deleted: "old", unchangedMissing: "source", changed: "before", typed: ["line"] },
    { added: "new", unchangedMissing: "source", changed: "after", typed: ["line"] },
    { deleted: "번역", changed: "현재 번역", typed: { unexpected: "shape" } },
  );
  assert.deepEqual(
    Object.fromEntries(changes.map((change) => [change.pointer, change.status])),
    {
      "/added": "added",
      "/changed": "changed",
      "/deleted": "deleted",
      "/typed": "conflict",
      "/unchangedMissing": "missing",
    },
  );
});

test("missing symbol never leaks into output", () => {
  const [change] = diffJson(MISSING, "new", MISSING);
  assert.equal(change.sourceBefore, null);
  assert.equal(change.translationCurrent, null);
});
