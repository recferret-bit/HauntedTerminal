#!/usr/bin/env node
// Dependency version gate: every runtime, dev, optional, and peer dependency in package.json must use an exact
// pinned semver version (no ^, ~, *, ranges, tags, or git URLs) and match package-lock.json cleanly.
//   node scripts/quality/check-deps.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXACT_SEMVER_RX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(resolve('package-lock.json'), 'utf8'));
const problems = [];

const lockRoot = lock.packages?.[''];
if (!lockRoot) {
  problems.push('package-lock.json is missing root packages[""] metadata (run npm install)');
} else {
  if (lockRoot.name !== pkg.name) {
    problems.push(`package.json name "${pkg.name}" differs from package-lock.json packages[""].name "${lockRoot.name}"`);
  }
  if (lockRoot.version !== pkg.version) {
    problems.push(`package.json version "${pkg.version}" differs from package-lock.json packages[""].version "${lockRoot.version}"`);
  }
}

for (const section of SECTIONS) {
  const entries = pkg[section] ?? {};
  const lockEntries = lockRoot?.[section] ?? {};
  for (const [name, spec] of Object.entries(entries)) {
    if (typeof spec !== 'string' || !EXACT_SEMVER_RX.test(spec)) {
      problems.push(`${section}.${name}: "${spec}" is not an exact pinned semver version (remove ^, ~, or range)`);
      continue;
    }
    if (lockRoot && lockEntries[name] !== spec) {
      problems.push(`${section}.${name}: package.json pins ${spec} but package-lock.json packages[""].${section} has ${lockEntries[name] ?? '(missing)'} (run npm install)`);
    }
    const locked = lock.packages?.[`node_modules/${name}`]?.version;
    if (!locked) {
      problems.push(`${section}.${name}: missing from package-lock.json packages["node_modules/${name}"] (run npm install)`);
    } else if (locked !== spec) {
      problems.push(`${section}.${name}: package.json pins ${spec} but package-lock.json resolves ${locked} (run npm install)`);
    }
  }
  for (const extra of Object.keys(lockEntries)) {
    if (!Object.hasOwn(entries, extra)) {
      problems.push(`${section}.${extra}: present in package-lock.json packages[""].${section} but missing from package.json (run npm install)`);
    }
  }
}

if (problems.length) {
  console.error(`dependency version gate FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('dependency version gate OK');
