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

test("added, deleted, missing, and conflicts are classified", () => {
  const changes = diffJson(
    { deleted: "old", unchangedMissing: "source", changed: "before", typed: ["line"] },
    { added: "new", unchangedMissing: "source", changed: "after", typed: ["line"] },
    { deleted: "번역", changed: "현재 번역", typed: "wrong type" },
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
