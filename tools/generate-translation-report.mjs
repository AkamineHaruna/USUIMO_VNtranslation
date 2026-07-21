#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLanguageReport } from "./translation-report-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const options = parseArgs(process.argv.slice(2));
const configPath = path.resolve(repoRoot, options.config ?? "translation-report.config.json");
const outputDir = path.resolve(repoRoot, options.output ?? "translation-report-dist");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const languages = options.language ? [options.language.toUpperCase()] : Object.keys(config.languages);

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outputDir, "reports"), { recursive: true });
fs.cpSync(path.join(repoRoot, "translation-report-web"), outputDir, { recursive: true });

const index = {
  schemaVersion: 1,
  repository: config.repository,
  generatedAt: new Date().toISOString(),
  languages: [],
};

for (const language of languages) {
  process.stdout.write(`Generating ${language} report... `);
  const report = buildLanguageReport({
    repoRoot,
    config,
    language,
    headRef: options.head ?? "HEAD",
  });
  const filename = `${language}.json`;
  fs.writeFileSync(path.join(outputDir, "reports", filename), `${JSON.stringify(report, null, 2)}\n`);
  index.languages.push({
    code: language,
    label: report.languageLabel,
    nativeLabel: report.languageNativeLabel,
    report: `reports/${filename}`,
    counts: report.counts,
    total: report.total,
  });
  process.stdout.write(`${report.total} items\n`);
}

fs.writeFileSync(path.join(outputDir, "reports", "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Report site generated at ${outputDir}`);

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    parsed[key.slice(2)] = value;
    index += 1;
  }
  return parsed;
}
