# Translation change report

This optional report turns Git history into a language-specific list of translation tasks. It is isolated from the game data packaging workflow: it only reads repository contents and publishes a static GitHub Pages artifact.

## Local preview

```bash
node tools/generate-translation-report.mjs
python3 -m http.server 4173 --directory translation-report-dist
```

Then open `http://localhost:4173/?lang=KR`.

The published selector includes all community-maintained language folders. EN is the source language, while CN, TW, and JP are maintained as official languages and are intentionally excluded.

## Language checkpoints

Each language in `translation-report.config.json` has a `baseCommit`. This is the English-source revision that the translation is known to have reviewed. Reports compare that revision with the current repository revision.

Do not advance a language checkpoint merely because a report was generated. Update it only after the corresponding translation work has been reviewed and merged.

To add another language, add its folder code and checkpoint to `translation-report.config.json`. The generator will include it in the language selector automatically.

## Report rules

- JSON objects are compared by key, independent of key order or formatting.
- Arrays are treated as atomic translation units to avoid index-shift errors.
- Strings and arrays containing only strings are compatible translation text, allowing language-specific line wrapping.
- Typographic-only English edits such as curly/straight quotes, equivalent dashes, ellipses, whitespace, and line wrapping are ignored.
- Empty text, booleans, numbers, and other non-translatable metadata are not reported as translation tasks.
- New English text is reported only when the target language does not already contain meaningful translated text.
- `NEW`, `EN CHANGED`, `OBSOLETE`, `MISSING`, and `CONFLICT` are reported.
- Deleted English entries are reported but never removed from translation files.
- The report generator never writes to `data/`.

## Deployment safety

The Pages workflow has read-only repository content permission. Its only write scopes are the dedicated GitHub Pages deployment permissions. Generated files are uploaded as a Pages artifact and are not committed back to the repository.
