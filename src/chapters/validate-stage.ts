import { isMusicId, isSfxId } from '../contracts/audio-cues.js';
import type { ActorKind, RoomSocketId, StageAmbientConfig, StageLightMode } from '../contracts/room-view.js';
import { isRec } from './record.js';
import type { ComixStorySpec, LevelStageHeroSpec, LevelStageSpec, LevelStageSubdirSpec } from './types.js';
import type { PackIssue } from './validate-pack.js';

const SOCKETS = new Set<RoomSocketId>(['door.left', 'door.right', 'door.down']);
const KINDS = new Set<ActorKind>(['vibecoder', 'enemy', 'boss', 'pickup', 'door', 'prop', 'npc']);
const LIGHTS = new Set<StageLightMode>(['off', 'lantern', 'monitor', 'blacklight', 'neon', 'storm']);
const HEX_RE = /^#[0-9a-f]{6}$/i;

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(fin);

export type AddIssue = (severity: PackIssue['severity'], tab: string, message: string) => void;

export function checkSfxCue(add: AddIssue, tab: string, what: string, cue: string | undefined): void {
  if (cue !== undefined && (!cue || !isSfxId(cue))) add('error', tab, `${what}: unknown SFX cue "${cue}"`);
}

export function checkMusicCue(add: AddIssue, tab: string, what: string, cue: string | undefined, allowEmpty = false): void {
  if (cue === undefined || (allowEmpty && cue === '')) return;
  if (!isMusicId(cue)) add('error', tab, `${what}: unknown music cue "${cue}"`);
}

function checkHexBackdrop(add: AddIssue, tab: string, what: string, hex: string | undefined): void {
  if (hex !== undefined && !HEX_RE.test(hex)) add('error', tab, `${what}: "${hex}" must be #rrggbb hex`);
}

export function checkSocket(add: AddIssue, tab: string, what: string, socket: string | undefined): void {
  if (socket !== undefined && !SOCKETS.has(socket as RoomSocketId)) {
    add('error', tab, `${what}: unknown socket "${socket}" (door.left, door.right, door.down)`);
  }
}

export function checkActorKind(add: AddIssue, tab: string, what: string, kind: string | undefined): void {
  if (kind !== undefined && !KINDS.has(kind as ActorKind)) add('error', tab, `${what}: unknown kind "${kind}"`);
}

export function checkTransform(add: AddIssue, tab: string, what: string, v: unknown): void {
  if (!isRec(v)) return;
  if (v.x !== undefined && !fin(v.x)) add('error', tab, `${what}.x: must be finite`);
  if (v.y !== undefined && !fin(v.y)) add('error', tab, `${what}.y: must be finite`);
  if (v.zOrder !== undefined && !fin(v.zOrder)) add('error', tab, `${what}.zOrder: must be finite`);
  if (v.scale !== undefined && !fin(v.scale) && !isVec3(v.scale)) {
    add('error', tab, `${what}.scale: expected a finite number or [sx, sy, sz]`);
  }
  if (v.rotation !== undefined && !fin(v.rotation) && !isVec3(v.rotation)) {
    add('error', tab, `${what}.rotation: expected degrees or [rx, ry, rz]`);
  }
}

function checkAmbient(add: AddIssue, tab: string, what: string, amb: StageAmbientConfig | undefined): void {
  if (!amb) return;
  if (amb.lightMode !== undefined && !LIGHTS.has(amb.lightMode)) {
    add('error', tab, `${what}.lightMode: unknown mode "${String(amb.lightMode)}"`);
  }
  if (typeof amb.bats === 'object' && amb.bats !== null) {
    if (amb.bats.minGapSec !== undefined && !fin(amb.bats.minGapSec)) add('error', tab, `${what}.bats.minGapSec: must be finite`);
    if (amb.bats.maxGapSec !== undefined && !fin(amb.bats.maxGapSec)) add('error', tab, `${what}.bats.maxGapSec: must be finite`);
    if (amb.bats.scale !== undefined && !fin(amb.bats.scale)) add('error', tab, `${what}.bats.scale: must be finite`);
    if (amb.bats.count !== undefined && (!Array.isArray(amb.bats.count) || amb.bats.count.length !== 2 || !amb.bats.count.every(fin))) {
      add('error', tab, `${what}.bats.count: expected [min, max]`);
    }
  }
  if (typeof amb.storm === 'object' && amb.storm !== null && amb.storm.intensity !== undefined && !fin(amb.storm.intensity)) {
    add('error', tab, `${what}.storm.intensity: must be finite`);
  }
  for (const cue of amb.loops ?? []) checkSfxCue(add, tab, `${what}.loops`, cue);
}

function checkHeroAndPort(add: AddIssue, what: string, hero: number | LevelStageHeroSpec | undefined, port: LevelStageSpec['entryPort']): void {
  if (typeof hero === 'number') {
    if (!fin(hero)) add('error', 'overview', `${what}.hero: must be finite`);
  } else if (hero !== undefined) {
    if (!fin(hero.x)) add('error', 'overview', `${what}.hero.x: must be finite`);
    checkTransform(add, 'overview', `${what}.hero`, hero);
  }
  if (port && typeof port === 'object') {
    checkSocket(add, 'overview', `${what}.entryPort`, port.socket);
    checkSfxCue(add, 'overview', `${what}.entryPort.sfx`, port.sfx);
    checkTransform(add, 'overview', `${what}.entryPort`, port);
  }
}

function checkSubdir(add: AddIssue, path: string, sub: LevelStageSubdirSpec): void {
  const what = `stage.subdirs["${path}"]`;
  if (!path.startsWith('/')) add('error', 'overview', `${what}: directory path must be absolute`);
  checkHeroAndPort(add, what, sub.hero, sub.entryPort);
  checkHexBackdrop(add, 'overview', `${what}.backdrop`, sub.backdrop);
  checkAmbient(add, 'overview', `${what}.ambient`, sub.ambient);
  checkMusicCue(add, 'overview', `${what}.music`, sub.music);
  checkSfxCue(add, 'overview', `${what}.sfx`, sub.sfx);
}

export function checkStageSpec(add: AddIssue, stage: LevelStageSpec | undefined): void {
  if (!stage) return;
  checkHeroAndPort(add, 'stage', stage.hero, stage.entryPort);
  if (stage.kiro) checkTransform(add, 'overview', 'stage.kiro', stage.kiro);
  checkHexBackdrop(add, 'overview', 'stage.backdrop', stage.backdrop);
  checkAmbient(add, 'overview', 'stage.ambient', stage.ambient);
  checkMusicCue(add, 'overview', 'stage.music', stage.music);
  if (stage.sfx) {
    checkSfxCue(add, 'overview', 'stage.sfx.enter', stage.sfx.enter);
    checkSfxCue(add, 'overview', 'stage.sfx.deny', stage.sfx.deny);
    checkSfxCue(add, 'overview', 'stage.sfx.exit', stage.sfx.exit);
  }
  for (const [path, sub] of Object.entries(stage.subdirs ?? {})) checkSubdir(add, path, sub);
}

export function checkComixStory(issues: PackIssue[], comix: ComixStorySpec | undefined): void {
  if (!comix) return;
  const add: AddIssue = (severity, tab, message) => issues.push({ severity, where: 'comix', tab, message });
  for (const page of comix.pages ?? []) {
    for (const panel of page.panels ?? []) {
      const what = `page ${page.pageNumber} panel "${panel.id}"`;
      checkHexBackdrop(add, 'comic', `${what}.backdrop`, panel.backdrop);
      checkHexBackdrop(add, 'comic', `${what}.bgHex`, panel.bgHex);
      if (panel.sfx?.cue !== undefined) checkSfxCue(add, 'comic', `${what}.sfx.cue`, panel.sfx.cue);
      (panel.cast ?? []).forEach((c, i) => checkTransform(add, 'comic', `${what}.cast[${i}]`, c));
      (panel.props ?? []).forEach((p, i) => checkTransform(add, 'comic', `${what}.props[${i}]`, p));
    }
  }
}
