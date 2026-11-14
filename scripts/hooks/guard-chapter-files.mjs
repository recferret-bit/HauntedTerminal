#!/usr/bin/env node
// PreToolUse guard for the declarative chapter system. Reads the hook event JSON from stdin, looks at every string in it
// that names a file, and decides:
//
//   src/chapters/generated/**       exit 2 (block): compiled output. Edit chapters/ and run generate-chapter.mjs.
//   the chapter vocabulary          ask: a new spec field ripples to the interpreter, the editor schema and the validators.
//     (src/chapters/types.ts, script-types.ts, script.ts, validate-pack.ts, src/chapter-editor/schema.ts)
//   anything else                   exit 0, no output.
//
// Usage (see .kiro/hooks/guard-chapter-files.json):  node scripts/hooks/guard-chapter-files.mjs
import { readFileSync } from 'node:fs';

const GENERATED = /(^|\/)src\/(chapters|cinematic)\/generated\//;
const VOCABULARY = /(^|\/)src\/(chapters\/(types|script-types|script|validate-pack)\.ts|chapter-editor\/schema(-check)?\.ts|editor-core\/schema(-check)?\.ts|cinematic\/(spec-types|simulate)\.ts|comix-editor\/(schema(-fields|-letters|-tracks)?|check)\.ts)$/;

let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

const paths = [];
try {
  (function walk(v) {
    if (typeof v === 'string') {
      // A path, not file content: one short line.
      if (v.length < 400 && !v.includes('\n') && /\.(ts|mjs|json)$/.test(v)) paths.push(v.replace(/\\/g, '/'));
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  })(JSON.parse(raw));
} catch {
  process.exit(0);
}

if (paths.some((p) => GENERATED.test(p))) {
  console.error(
    'generated/ is compiled output. Edit chapters/<slug>/*.json (generate-chapter.mjs) or comix/<slug>/*.json (generate-comix.mjs) instead.',
  );
  process.exit(2);
}

const hit = paths.find((p) => VOCABULARY.test(p));
if (hit) {
  const isComix = /cinematic\/|comix-editor\//.test(hit);
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: isComix
          ? `${hit} is part of the comix vocabulary. A spec capability is one change in four places: ` +
            'src/cinematic/spec-types.ts (type), src/cinematic/ (interpreter), src/comix-editor/schema.ts (form), ' +
            'src/comix-editor/check.ts (checks). Confirm you are updating all of them, then run: node scripts/harness/generate-comix.mjs --verify'
          : `${hit} is part of the chapter vocabulary. A spec capability is one change in four places: ` +
            'src/chapters/script-types.ts (type), src/chapters/script.ts (interpreter), src/chapter-editor/schema.ts (form), ' +
            'src/chapters/validate-pack.ts (checks). Confirm you are updating all of them, then run: node scripts/harness/generate-chapter.mjs --verify',
      },
    }),
  );
}
process.exit(0);
