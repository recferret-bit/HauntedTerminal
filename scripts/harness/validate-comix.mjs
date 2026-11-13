#!/usr/bin/env node
// Structural check for comix/<id>/. Plain node, no Vite.
//   node scripts/harness/validate-comix.mjs
// Fails when a required spec is missing, manifest.id disagrees with the folder, a mark expression does not
// resolve, a panel id is repeated, or a letter/camera panel id is unknown.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve('comix');
const REQUIRED = ['manifest.json', 'marks.json', 'cast.json', 'set.json', 'letters.json', 'beats.json', 'camera.json', 'poses.json'];
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const NAMED = /^([A-Za-z_][\w]*)([+-]\d+(?:\.\d+)?)?$/;

const LETTER_MARKS = {
  caption: ['from'], meme: ['at'], sfx: ['at'], sfx_burst: ['from'], bubble: ['at', 'until'],
  cast_bubbles: ['at', 'step', 'until'], queue: ['from'], tags: ['from'], lines: ['from'], brain: ['from'],
  card: ['at', 'typeFrom', 'typeTo', 'fadeFrom', 'fadeTo'], page_turn: ['from', 'to'], panel_flash: ['at'], invert: ['at'],
};
const BEAT_MARKS = {
  lightning: ['at'], fx: ['at'], fx_repeat: ['at'], look: ['at'], audio: ['at'], state: ['at'],
  arcs: ['at'], keys: ['from', 'until'], shatter_cast: ['at'],
};
const POSE_MARKS = {
  seated: ['typingUntil', 'typingMidUntil'], suck: ['from', 'to', 'hideAt', 'recoilAt'], rain: ['until'],
  monitor: ['hideGlassAt', 'hideCodeAt', 'vortexFrom', 'vortexUntil', 'amberAt'],
  emerge: ['showFrom', 'hideAt', 'wakeAt', 'riseAt', 'leanFrom', 'leanTo'],
  flight: ['from', 'to'], fling: ['from', 'to', 'hideAt'], screen_blaze: ['until', 'blinkUntil'],
  bolt_flicker: ['at'], shake: [], stage_flash: [], pixelate: ['from', 'to'],
};

const issues = [];

function walk(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else if (name.endsWith('.json')) out.push(rel);
  }
  return out.sort();
}

function read(dir, rel, bag) {
  try {
    bag[rel] = JSON.parse(readFileSync(join(dir, rel), 'utf8'));
  } catch (err) {
    issues.push(`comix/${rel}: ${err.message}`);
  }
}

function checkExpr(file, at, expr, marks) {
  if (expr === undefined) return;
  if (typeof expr !== 'string') {
    issues.push(`${file}: ${at} is not a mark expression`);
    return;
  }
  const text = expr.trim();
  if (NUMBER.test(text)) return;
  const found = NAMED.exec(text);
  if (!found || !Object.hasOwn(marks, found[1])) issues.push(`${file}: ${at} mark "${expr}" does not resolve`);
}

function checkKeys(file, at, value, keys, marks) {
  if (!value || typeof value !== 'object') return;
  for (const key of keys) checkExpr(file, `${at}.${key}`, value[key], marks);
}

function checkPoses(file, programs, marks) {
  if (!Array.isArray(programs)) return;
  programs.forEach((program, i) => {
    const at = `programs[${i}]`;
    checkKeys(file, at, program, POSE_MARKS[program?.kind] ?? [], marks);
    if (program?.kind === 'monitor' && Array.isArray(program.glitch)) {
      program.glitch.forEach((pair, j) => { if (Array.isArray(pair)) pair.forEach((expr, k) => checkExpr(file, `${at}.glitch[${j}][${k}]`, expr, marks)); });
    }
    if (program?.kind === 'shake') {
      (program.windows ?? []).forEach((win, j) => checkExpr(file, `${at}.windows[${j}].at`, win?.at, marks));
      checkKeys(file, `${at}.pull`, program.pull, ['from', 'until', 'spanFrom', 'spanTo'], marks);
    }
    if (program?.kind === 'stage_flash') {
      (program.rules ?? []).forEach((rule, j) => checkKeys(file, `${at}.rules[${j}]`, rule, ['from', 'until'], marks));
    }
  });
}

function needPanel(file, at, panel, ids) {
  if (typeof panel !== 'string' || ids.has(panel)) return;
  issues.push(`${file}: ${at} panel "${panel}" does not exist`);
}

function checkPages(id, json, marks) {
  const ids = new Map();
  for (const rel of Object.keys(json).filter((name) => name.startsWith('pages/'))) {
    const page = json[rel];
    const panels = Array.isArray(page?.panels) ? page.panels : [];
    panels.forEach((panel, i) => {
      const file = `comix/${id}/${rel}`;
      if (!panel || typeof panel.id !== 'string') return;
      if (ids.has(panel.id)) issues.push(`${file}: panels[${i}].id "${panel.id}" is also used in ${ids.get(panel.id)}`);
      else ids.set(panel.id, file);
      checkExpr(file, `panels[${i}].at`, panel.at, marks);
    });
  }
  return ids;
}

function checkRefs(id, json, ids) {
  const letters = `comix/${id}/letters.json`;
  (Array.isArray(json['letters.json']) ? json['letters.json'] : []).forEach((letter, i) => {
    if (letter && typeof letter.panel === 'string') needPanel(letters, `[${i}].panel`, letter.panel, ids);
  });
  const camera = `comix/${id}/camera.json`;
  (Array.isArray(json['camera.json']) ? json['camera.json'] : []).forEach((shot, i) => {
    if (shot) needPanel(camera, `[${i}].panel`, shot.panel, ids);
  });
  const splash = json['splash.json'];
  if (splash && typeof splash.panel === 'string') needPanel(`comix/${id}/splash.json`, 'panel', splash.panel, ids);
  const frames = json['manifest.json']?.keyframes;
  if (Array.isArray(frames)) frames.forEach((frame, i) => needPanel(`comix/${id}/manifest.json`, `keyframes[${i}].panel`, frame?.panel, ids));
}

function checkMarks(id, json, marks) {
  const file = (rel) => `comix/${id}/${rel}`;
  (Array.isArray(json['letters.json']) ? json['letters.json'] : []).forEach((letter, i) => {
    checkKeys(file('letters.json'), `[${i}]`, letter, LETTER_MARKS[letter?.kind] ?? [], marks);
  });
  (Array.isArray(json['beats.json']) ? json['beats.json'] : []).forEach((beat, i) => {
    checkKeys(file('beats.json'), `[${i}]`, beat, BEAT_MARKS[beat?.kind] ?? [], marks);
  });
  (Array.isArray(json['camera.json']) ? json['camera.json'] : []).forEach((shot, i) => {
    (shot?.span ?? []).forEach((expr, j) => checkExpr(file('camera.json'), `[${i}].span[${j}]`, expr, marks));
  });
  checkPoses(file('poses.json'), json['poses.json']?.programs, marks);
  const splash = json['splash.json'];
  if (splash) {
    checkExpr(file('splash.json'), 'at', splash.at, marks);
    checkExpr(file('splash.json'), 'keyAt', splash.keyAt, marks);
    checkExpr(file('splash.json'), 'caption.from', splash.caption?.from, marks);
  }
}

function checkFolderFiles(id) {
  const dir = join(ROOT, id);
  const files = walk(dir);
  for (const name of REQUIRED) if (!files.includes(name)) issues.push(`comix/${id}/${name}: missing`);
  if (!files.some((rel) => rel.startsWith('pages/') && rel.endsWith('.json'))) issues.push(`comix/${id}: no pages/*.json`);
  const json = {};
  for (const rel of files) read(dir, rel, json);
  const manifest = json['manifest.json'];
  if (manifest && manifest.id !== id) issues.push(`comix/${id}/manifest.json: id "${manifest.id}" does not match folder ${id}`);
  const marks = json['marks.json'] && typeof json['marks.json'] === 'object' && !Array.isArray(json['marks.json']) ? json['marks.json'] : {};
  if (manifest) {
    checkExpr(`comix/${id}/manifest.json`, 'end', manifest.end, marks);
    checkExpr(`comix/${id}/manifest.json`, 'acceptsKeyFrom', manifest.acceptsKeyFrom, marks);
    (manifest.keyframes ?? []).forEach((frame, i) => checkExpr(`comix/${id}/manifest.json`, `keyframes[${i}].at`, frame?.at, marks));
    if (Array.isArray(manifest.skip)) manifest.skip.forEach((rule, i) => checkKeys(`comix/${id}/manifest.json`, `skip[${i}]`, rule, ['before', 'to'], marks));
  }
  const ids = checkPages(id, json, marks);
  checkRefs(id, json, ids);
  checkMarks(id, json, marks);
}

if (!existsSync(ROOT)) {
  console.log('comix/: missing');
  process.exit(1);
}
for (const name of readdirSync(ROOT).filter((entry) => statSync(join(ROOT, entry)).isDirectory()).sort()) checkFolderFiles(name);
if (issues.length) {
  for (const line of issues) console.log(line);
  console.log(`${issues.length} comix problem(s)`);
  process.exit(1);
}
console.log('comix OK');
