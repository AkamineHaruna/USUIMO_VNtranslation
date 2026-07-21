import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MISSING = Symbol("missing");

export function encodePointer(segments) {
  if (segments.length === 0) return "";
  return `/${segments
    .map((segment) => String(segment).replaceAll("~", "~0").replaceAll("/", "~1"))
    .join("/")}`;
}

export function valuesEqual(left, right) {
  if (left === MISSING || right === MISSING) return left === right;
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => Object.hasOwn(right, key) && valuesEqual(left[key], right[key]));
  }
  return false;
}

export function diffJson(base, current, target = MISSING) {
  const changes = [];
  walkDiff(base, current, target, [], changes);
  return changes;
}

export function mapSourcePathToTarget(sourcePath, sourceLanguage, targetLanguage) {
  const normalized = sourcePath.split(path.sep).join("/");
  const sourcePrefix = `data/${sourceLanguage}/`;
  if (!normalized.startsWith(sourcePrefix)) {
    throw new Error(`Source path is outside ${sourcePrefix}: ${sourcePath}`);
  }
  const sourceName = normalized.slice(sourcePrefix.length);
  const token = new RegExp(`${escapeRegExp(sourceLanguage)}(?=\\d*\\.json$)`, "i");
  const targetName = sourceName.replace(token, targetLanguage);
  if (targetName === sourceName) {
    throw new Error(`Could not map source filename to ${targetLanguage}: ${sourceName}`);
  }
  return `data/${targetLanguage}/${targetName}`;
}

export function buildLanguageReport({ repoRoot, config, language, headRef = "HEAD" }) {
  const languageConfig = config.languages[language];
  if (!languageConfig) throw new Error(`Language ${language} is not configured.`);

  const sourceLanguage = config.sourceLanguage;
  const baseRef = languageConfig.baseCommit;
  assertGitRef(repoRoot, baseRef);
  assertGitRef(repoRoot, headRef);

  const baseFiles = listJsonFiles(repoRoot, baseRef, sourceLanguage);
  const headFiles = listJsonFiles(repoRoot, headRef, sourceLanguage);
  const sourceFiles = [...new Set([...baseFiles, ...headFiles])].sort();
  const entries = [];

  for (const sourceFile of sourceFiles) {
    const baseSource = readJsonAtRef(repoRoot, baseRef, sourceFile);
    const currentSource = readJsonAtRef(repoRoot, headRef, sourceFile);
    const mappingSource = currentSource === MISSING ? sourceFile : sourceFile;
    const targetFile = mapSourcePathToTarget(mappingSource, sourceLanguage, language);
    const currentTarget = readJsonAtRef(repoRoot, headRef, targetFile);
    const fileChanges = diffJson(baseSource, currentSource, currentTarget);

    for (const change of fileChanges) {
      entries.push({
        ...change,
        sourceFile,
        targetFile,
      });
    }
  }

  entries.sort((left, right) =>
    left.sourceFile.localeCompare(right.sourceFile, "en") ||
    left.pointer.localeCompare(right.pointer, "en"),
  );

  const baseCommit = getCommitInfo(repoRoot, baseRef);
  const headCommit = getCommitInfo(repoRoot, headRef);
  const counts = Object.fromEntries(
    ["added", "changed", "deleted", "missing", "conflict"].map((status) => [
      status,
      entries.filter((entry) => entry.status === status).length,
    ]),
  );

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repository: config.repository,
    sourceLanguage,
    language,
    languageLabel: languageConfig.label,
    languageNativeLabel: languageConfig.nativeLabel,
    baseNote: languageConfig.baseNote,
    baseCommit,
    headCommit,
    counts,
    total: entries.length,
    entries,
  };
}

function walkDiff(base, current, target, segments, output) {
  if (base === MISSING && current === MISSING) return;

  if (base === MISSING) {
    if (isPlainObject(current) && Object.keys(current).length > 0) {
      for (const key of Object.keys(current)) {
        walkDiff(MISSING, current[key], getChild(target, key), [...segments, key], output);
      }
      return;
    }
    pushChange(output, "added", segments, base, current, target);
    return;
  }

  if (current === MISSING) {
    if (isPlainObject(base) && Object.keys(base).length > 0) {
      for (const key of Object.keys(base)) {
        walkDiff(base[key], MISSING, getChild(target, key), [...segments, key], output);
      }
      return;
    }
    pushChange(output, "deleted", segments, base, current, target);
    return;
  }

  if (isPlainObject(base) && isPlainObject(current)) {
    const keys = [...new Set([...Object.keys(base), ...Object.keys(current)])].sort();
    if (keys.length === 0 && target === MISSING) {
      pushChange(output, "missing", segments, base, current, target);
      return;
    }
    for (const key of keys) {
      walkDiff(
        Object.hasOwn(base, key) ? base[key] : MISSING,
        Object.hasOwn(current, key) ? current[key] : MISSING,
        getChild(target, key),
        [...segments, key],
        output,
      );
    }
    return;
  }

  const sourceChanged = !valuesEqual(base, current);
  const targetMissing = target === MISSING;
  const targetConflict = !targetMissing && !compatibleTypes(current, target);

  if (sourceChanged) {
    pushChange(output, targetConflict ? "conflict" : "changed", segments, base, current, target);
  } else if (targetMissing) {
    pushChange(output, "missing", segments, base, current, target);
  } else if (targetConflict) {
    pushChange(output, "conflict", segments, base, current, target);
  }
}

function pushChange(output, status, segments, base, current, target) {
  output.push({
    status,
    pointer: encodePointer(segments),
    sourceBefore: serializable(base),
    sourceAfter: serializable(current),
    translationCurrent: serializable(target),
  });
}

function serializable(value) {
  return value === MISSING ? null : value;
}

function getChild(value, key) {
  if (value === MISSING || value === null || typeof value !== "object") return MISSING;
  if (!Object.hasOwn(value, key)) return MISSING;
  return value[key];
}

function compatibleTypes(source, target) {
  if (Array.isArray(source)) return Array.isArray(target);
  if (isPlainObject(source)) return isPlainObject(target);
  if (source === null) return target === null;
  return typeof source === typeof target;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function listJsonFiles(repoRoot, ref, sourceLanguage) {
  const prefix = `data/${sourceLanguage}`;
  const output = git(repoRoot, ["ls-tree", "-r", "--name-only", ref, "--", prefix]);
  return output.split("\n").filter((file) => file.toLowerCase().endsWith(".json"));
}

function readJsonAtRef(repoRoot, ref, filePath) {
  try {
    return JSON.parse(git(repoRoot, ["show", `${ref}:${filePath}`]));
  } catch (error) {
    const exists = gitStatus(repoRoot, ["cat-file", "-e", `${ref}:${filePath}`]);
    if (exists !== 0) return MISSING;
    throw new Error(`Invalid JSON at ${ref}:${filePath}\n${error.message}`);
  }
}

function getCommitInfo(repoRoot, ref) {
  const [sha, committedAt, ...subjectParts] = git(repoRoot, [
    "show",
    "-s",
    "--format=%H%n%cI%n%s",
    ref,
  ]).split("\n");
  return { sha, committedAt, subject: subjectParts.join("\n") };
}

function assertGitRef(repoRoot, ref) {
  if (gitStatus(repoRoot, ["rev-parse", "--verify", `${ref}^{commit}`]) !== 0) {
    throw new Error(`Unknown Git commit or ref: ${ref}`);
  }
}

function git(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

function gitStatus(repoRoot, args) {
  try {
    execFileSync("git", args, { cwd: repoRoot, stdio: "ignore" });
    return 0;
  } catch {
    return 1;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { MISSING };
