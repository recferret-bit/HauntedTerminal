#!/usr/bin/env node
// Size gate: no source file over 600 lines, no function over 130 lines.
//   node scripts/quality/check-size.mjs [dir ...]      (default: src)
// Exit 1 when a limit is exceeded. Functions = declarations, methods, arrows, function expressions.
// src/chapters/generated/ and src/cinematic/generated/ are compiled spec data (regenerate, do not hand-edit) and are not counted.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const MAX_FILE = 600;
const MAX_FUNC = 130;
const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['src'];
const GENERATED_DIRS = [join('src', 'chapters', 'generated'), join('src', 'cinematic', 'generated')];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|mjs)$/.test(name) && !name.endsWith('.d.ts') && !GENERATED_DIRS.some((g) => p.includes(g))) yield p;
  }
}

let bad = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    if (lines > MAX_FILE) { console.log(`FILE ${lines} > ${MAX_FILE}  ${relative('.', file)}`); bad++; }
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
    (function visit(node) {
      if (ts.isFunctionLike(node) && node.body) {
        const a = sf.getLineAndCharacterOfPosition(node.getStart()).line;
        const b = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
        const len = b - a + 1;
        if (len > MAX_FUNC) {
          const name = node.name?.getText() ?? (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText() : '(anonymous)');
          console.log(`FUNC ${len} > ${MAX_FUNC}  ${relative('.', file)}:${a + 1} ${name}`); bad++;
        }
      }
      ts.forEachChild(node, visit);
    })(sf);
  }
}
console.log(bad ? `${bad} violation(s)` : 'size gate OK');
process.exit(bad ? 1 : 0);
