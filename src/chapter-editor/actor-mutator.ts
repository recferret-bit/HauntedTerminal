import type {
  ChapterPack,
  LevelEnemySpec,
  LevelFileSpec,
  LevelPropSpec,
  LevelSpec,
  LevelStageHeroSpec,
} from '../chapters/types.js';
import type { StageTransformPatch } from '../contracts/stage-editor.js';

import type { PickupType } from '../game/bestiary.js';

export type AddObjectPreset =
  | 'prop'
  | 'enemy'
  | 'pickup'
  | 'pickup:ram'
  | 'pickup:ssd'
  | 'pickup:gpu'
  | 'pickup:energy'
  | 'pickup:tube_transistor'
  | 'pickup:tensor_gpu'
  | 'pickup:vram_module'
  | 'door'
  | 'socket';

export interface ActorTargetResolution {
  fileKey: string;
  itemPath: string;
  tab: 'overview' | 'entities' | 'files' | 'manifest';
  target: 'level' | 'chapter';
  kind: 'hero' | 'entryPort' | 'kiro' | 'prop' | 'pickup' | 'enemy' | 'file' | 'cameo' | 'outro';
  index?: number;
  subdirCwd?: string;
}

function normalizeSpecPath(raw: string, baseCwd: string): string {
  const joined = raw.startsWith('/') ? raw : `${baseCwd === '/' ? '' : baseCwd}/${raw}`;
  const parts: string[] = [];
  for (const seg of joined.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return `/${parts.join('/')}`;
}

function joinCwd(cwd: string, name: string): string {
  return normalizeSpecPath(name, cwd);
}

function baseName(fullPath: string): string {
  const idx = fullPath.lastIndexOf('/');
  return idx >= 0 ? fullPath.slice(idx + 1) : fullPath;
}

function parentPathOf(fullPath: string): string {
  const idx = fullPath.lastIndexOf('/');
  return idx <= 0 ? '/' : fullPath.slice(0, idx);
}

function isObjectRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function resolveActorTarget(
  pack: ChapterPack,
  level: LevelSpec,
  cwd: string,
  actorId: string,
  target?: string,
  portRole?: 'entry' | 'exit' | 'sub',
): ActorTargetResolution | null {
  const inSubdir = cwd !== level.cwd && Boolean(level.stage?.subdirs?.[cwd]);

  if (actorId === 'vibecoder') {
    const subSuffix = inSubdir ? `.subdirs.${cwd}` : '';
    return {
      fileKey: level.id,
      itemPath: `${level.id}.overview.stage${subSuffix}.hero`,
      tab: 'overview',
      target: 'level',
      kind: 'hero',
      ...(inSubdir ? { subdirCwd: cwd } : {}),
    };
  }

  if (actorId === 'door:entry' || portRole === 'entry') {
    const subSuffix = inSubdir ? `.subdirs.${cwd}` : '';
    return {
      fileKey: level.id,
      itemPath: `${level.id}.overview.stage${subSuffix}.entryPort`,
      tab: 'overview',
      target: 'level',
      kind: 'entryPort',
      ...(inSubdir ? { subdirCwd: cwd } : {}),
    };
  }

  if (actorId === 'kiro') {
    return {
      fileKey: level.id,
      itemPath: `${level.id}.overview.stage.kiro`,
      tab: 'overview',
      target: 'level',
      kind: 'kiro',
    };
  }

  if (actorId === 'boss:cameo') {
    return {
      fileKey: 'chapter',
      itemPath: 'manifest.boss.cameoTransform',
      tab: 'manifest',
      target: 'chapter',
      kind: 'cameo',
    };
  }

  const outroIdx = (pack.manifest.outro?.actors ?? []).findIndex((a) => a.id === actorId);
  if (outroIdx >= 0) {
    return {
      fileKey: 'chapter',
      itemPath: `manifest.outro.actors[${outroIdx}]`,
      tab: 'manifest',
      target: 'chapter',
      kind: 'outro',
      index: outroIdx,
    };
  }

  const props = level.props ?? [];
  const exactPropIdx = props.findIndex(
    (p) => (p.cwd ?? level.cwd) === cwd && ((p.id.startsWith('prop:') ? p.id : `prop:${p.id}`) === actorId || p.id === actorId),
  );
  const propIdx =
    exactPropIdx >= 0
      ? exactPropIdx
      : props.findIndex((p) => (p.id.startsWith('prop:') ? p.id : `prop:${p.id}`) === actorId || p.id === actorId);
  if (propIdx >= 0) {
    return {
      fileKey: level.id,
      itemPath: `${level.id}.entities.props[${propIdx}]`,
      tab: 'entities',
      target: 'level',
      kind: 'prop',
      index: propIdx,
    };
  }

  const pickupIdx = level.pickups.findIndex((p) => p.id === actorId);
  if (pickupIdx >= 0) {
    return {
      fileKey: level.id,
      itemPath: `${level.id}.entities.pickups[${pickupIdx}]`,
      tab: 'entities',
      target: 'level',
      kind: 'pickup',
      index: pickupIdx,
    };
  }

  const enemyIdx = level.enemies.findIndex((e) => e.id === actorId);
  if (enemyIdx >= 0) {
    return {
      fileKey: level.id,
      itemPath: `${level.id}.entities.enemies[${enemyIdx}]`,
      tab: 'entities',
      target: 'level',
      kind: 'enemy',
      index: enemyIdx,
    };
  }

  const wantName = target ?? actorId.replace(/^(file|sock|door):/, '');
  if (wantName) {
    const wantPath = joinCwd(cwd, wantName);
    const fileIdx = level.files.findIndex((f) => normalizeSpecPath(f.path, level.cwd) === wantPath);
    if (fileIdx >= 0) {
      return {
        fileKey: level.id,
        itemPath: `${level.id}.files.files[${fileIdx}]`,
        tab: 'files',
        target: 'level',
        kind: 'file',
        index: fileIdx,
      };
    }
  }

  return null;
}

export function actorIdForItemPath(
  pack: ChapterPack,
  level: LevelSpec,
  cwd: string,
  itemPath: string,
): string | null {
  if (itemPath.startsWith('manifest.outro.actors[')) {
    const m = /^manifest\.outro\.actors\[(\d+)\]/.exec(itemPath);
    const idx = m ? Number(m[1]) : -1;
    return pack.manifest.outro?.actors?.[idx]?.id ?? null;
  }
  if (itemPath.startsWith('manifest.boss.cameoTransform')) {
    return 'boss:cameo';
  }
  const prefix = `${level.id}.`;
  if (!itemPath.startsWith(prefix)) return null;
  const rest = itemPath.slice(prefix.length);

  if (rest.startsWith('overview.stage')) {
    if (rest.endsWith('.hero')) return 'vibecoder';
    if (rest.endsWith('.entryPort')) return 'door:entry';
    if (rest.endsWith('.kiro')) return 'kiro';
    return null;
  }

  const mProp = /^entities\.props\[(\d+)\]/.exec(rest);
  if (mProp) {
    const p = level.props?.[Number(mProp[1])];
    if (!p || (p.cwd ?? level.cwd) !== cwd) return null;
    return p.id.startsWith('prop:') || p.id.startsWith('door:') || p.id === 'hole' ? p.id : `prop:${p.id}`;
  }

  const mPickup = /^entities\.pickups\[(\d+)\]/.exec(rest);
  if (mPickup) {
    return level.pickups[Number(mPickup[1])]?.id ?? null;
  }

  const mEnemy = /^entities\.enemies\[(\d+)\]/.exec(rest);
  if (mEnemy) {
    return level.enemies[Number(mEnemy[1])]?.id ?? null;
  }

  const mFile = /^files\.files\[(\d+)\]/.exec(rest);
  if (mFile) {
    const f = level.files[Number(mFile[1])];
    if (!f) return null;
    const norm = normalizeSpecPath(f.path, level.cwd);
    if (parentPathOf(norm) !== cwd) return null;
    const enemy = level.enemies.find((e) => normalizeSpecPath(e.path, level.cwd) === norm);
    if (enemy) return enemy.id;
    const pickup = level.pickups.find((p) => normalizeSpecPath(p.path, level.cwd) === norm);
    if (pickup) return pickup.id;
    const base = baseName(norm);
    const pfx = f.kind === 'dir' ? 'door' : f.kind === 'socket' ? 'sock' : 'file';
    return `${pfx}:${base}`;
  }

  return null;
}

function applyFields(obj: Record<string, unknown>, patch: StageTransformPatch): void {
  if (patch.x !== undefined) obj.x = patch.x;
  if (patch.y !== undefined) {
    if (patch.y === null || patch.y === 0) delete obj.y;
    else obj.y = patch.y;
  }
  if (patch.scale !== undefined) {
    if (patch.scale === 1) delete obj.scale;
    else obj.scale = patch.scale;
  }
  if (patch.rotation !== undefined) {
    if (patch.rotation === 0) delete obj.rotation;
    else obj.rotation = patch.rotation;
  }
  if (patch.zOrder !== undefined) {
    if (patch.zOrder === 0) delete obj.zOrder;
    else obj.zOrder = patch.zOrder;
  }
  if (patch.detachSocket) delete obj.socket;
}

function mutateHeroField(
  holder: { hero?: number | LevelStageHeroSpec },
  patch: StageTransformPatch,
): void {
  const cur = holder.hero;
  const needsObject =
    isObjectRecord(cur) ||
    (patch.y !== undefined && patch.y !== null && patch.y !== 0) ||
    (patch.scale !== undefined && patch.scale !== 1) ||
    (patch.rotation !== undefined && patch.rotation !== 0) ||
    (patch.zOrder !== undefined && patch.zOrder !== 0);
  if (!needsObject) {
    holder.hero = patch.x ?? (typeof cur === 'number' ? cur : 2.4);
    return;
  }
  const obj: Record<string, unknown> = isObjectRecord(cur)
    ? (cur as unknown as Record<string, unknown>)
    : { x: typeof cur === 'number' ? cur : 2.4 };
  applyFields(obj, patch);
  holder.hero = obj as unknown as LevelStageHeroSpec;
}

function mutateEntryPortField(
  holder: { entryPort?: unknown },
  patch: StageTransformPatch,
): void {
  const cur = holder.entryPort;
  const obj: Record<string, unknown> = isObjectRecord(cur)
    ? cur
    : {
        ...(typeof cur === 'string' && !patch.detachSocket
          ? { socket: cur }
          : !patch.detachSocket && patch.x === undefined
            ? { socket: 'door.left' }
            : {}),
        ...(patch.x !== undefined ? { x: patch.x } : { x: 4.37 }),
      };
  applyFields(obj, patch);
  holder.entryPort = obj;
}

function targetStageScope(level: LevelSpec, subdirCwd?: string) {
  level.stage ??= {};
  if (!subdirCwd) return level.stage;
  level.stage.subdirs ??= {};
  level.stage.subdirs[subdirCwd] ??= {};
  return level.stage.subdirs[subdirCwd]!;
}

export function applyStageTransformPatch(
  pack: ChapterPack,
  level: LevelSpec,
  cwd: string,
  patch: StageTransformPatch,
): ActorTargetResolution | null {
  const res = resolveActorTarget(pack, level, cwd, patch.actorId, patch.target, patch.portRole);
  if (!res) return null;

  if (res.kind === 'hero') {
    mutateHeroField(targetStageScope(level, res.subdirCwd), patch);
    return res;
  }

  if (res.kind === 'entryPort') {
    mutateEntryPortField(targetStageScope(level, res.subdirCwd), patch);
    return res;
  }

  if (res.kind === 'kiro') {
    level.stage ??= {};
    level.stage.kiro ??= {};
    const kiro = level.stage.kiro as Record<string, unknown>;
    if (patch.x !== undefined) delete kiro.target;
    applyFields(kiro, patch);
    return res;
  }

  if (res.kind === 'cameo') {
    pack.manifest.boss.cameoTransform ??= {};
    applyFields(pack.manifest.boss.cameoTransform as Record<string, unknown>, patch);
    return res;
  }

  if (res.kind === 'outro' && res.index !== undefined) {
    const actor = pack.manifest.outro?.actors?.[res.index];
    if (!actor) return null;
    applyFields(actor as unknown as Record<string, unknown>, patch);
    return res;
  }

  if (res.kind === 'prop' && res.index !== undefined) {
    const prop = level.props?.[res.index];
    if (!prop) return null;
    applyFields(prop as unknown as Record<string, unknown>, patch);
    return res;
  }

  if (res.kind === 'pickup' && res.index !== undefined) {
    const pickup = level.pickups[res.index];
    if (!pickup) return null;
    applyFields(pickup as unknown as Record<string, unknown>, patch);
    return res;
  }

  if (res.kind === 'enemy' && res.index !== undefined) {
    const enemy = level.enemies[res.index];
    if (!enemy) return null;
    applyFields(enemy as unknown as Record<string, unknown>, patch);
    return res;
  }

  if (res.kind === 'file' && res.index !== undefined) {
    const file = level.files[res.index];
    if (!file) return null;
    applyFields(file as unknown as Record<string, unknown>, patch);
    return res;
  }

  return null;
}

function collectUsedX(level: LevelSpec, cwd: string): number[] {
  const xs: number[] = [];
  for (const p of level.props ?? []) if ((p.cwd ?? level.cwd) === cwd) xs.push(p.x);
  for (const e of level.enemies) if (e.x !== undefined) xs.push(e.x);
  for (const p of level.pickups) if (p.x !== undefined) xs.push(p.x);
  for (const f of level.files) if (f.x !== undefined && parentPathOf(normalizeSpecPath(f.path, level.cwd)) === cwd) xs.push(f.x);
  return xs;
}

function findFreeSlotX(level: LevelSpec, cwd: string): number {
  const used = collectUsedX(level, cwd);
  const candidates = [1.8, 1.2, 2.4, 0.6, 3.0, 0.0, 3.6, -0.5];
  return candidates.find((cx) => used.every((ux) => Math.abs(ux - cx) >= 0.4)) ?? 1.8;
}

function uniqueName(existing: Set<string>, prefix: string, ext = ''): string {
  let n = 1;
  while (existing.has(`${prefix}_${n}${ext}`)) n += 1;
  return `${prefix}_${n}${ext}`;
}

const PICKUP_LABELS: Record<string, string> = {
  ram: '16GB RAM',
  ssd: '256GB SSD',
  gpu: 'GPU Module',
  energy: 'Energy Cell',
  tube_transistor: 'Vacuum Tube',
  tensor_gpu: 'Tensor GPU',
  vram_module: 'VRAM Module',
};

function addPickupPreset(
  level: LevelSpec,
  cwd: string,
  x: number,
  fileNames: Set<string>,
  preset: string,
): { actorId: string; fileKey: string; itemPath: string; tab: 'entities' | 'files' } {
  const sub = preset === 'pickup' ? 'ram' : preset.slice('pickup:'.length);
  const pickupType: PickupType = sub === 'gpu' ? 'ssd' : (sub as PickupType);
  const pickupIds = new Set(level.pickups.map((p) => p.id));
  const id = uniqueName(pickupIds, sub);
  const ext = sub === 'gpu' ? '.gpu' : '.dat';
  const fileName = uniqueName(fileNames, `${sub}_module`, ext);
  const path = joinCwd(cwd, fileName);
  const modelOverride = sub === 'gpu' ? 'pickup.gpu' : undefined;
  const label = PICKUP_LABELS[sub] ?? sub;
  level.files.push({ path, kind: 'file', mode: 0o644, content: `${label}\n` });
  level.pickups.push({
    id,
    type: pickupType,
    path,
    x,
    ...(modelOverride ? { model: modelOverride } : {}),
    label,
  });
  return {
    actorId: id,
    fileKey: level.id,
    itemPath: `${level.id}.entities.pickups[${level.pickups.length - 1}]`,
    tab: 'entities',
  };
}

export function addObjectToLevel(
  level: LevelSpec,
  cwd: string,
  preset: AddObjectPreset,
): { actorId: string; fileKey: string; itemPath: string; tab: 'entities' | 'files' } {
  const x = findFreeSlotX(level, cwd);
  const filePaths = new Set(level.files.map((f) => normalizeSpecPath(f.path, level.cwd)));
  const fileNames = new Set([...filePaths].map(baseName));

  if (preset === 'pickup' || preset.startsWith('pickup:')) {
    return addPickupPreset(level, cwd, x, fileNames, preset);
  }

  if (preset === 'prop') {
    level.props ??= [];
    const propIds = new Set(level.props.map((p) => p.id.replace(/^prop:/, '')));
    const id = uniqueName(propIds, 'prop_tar');
    const prop: LevelPropSpec = {
      id,
      model: 'prop.tar',
      kind: 'prop',
      x,
      ...(cwd !== level.cwd ? { cwd } : {}),
      label: id,
    };
    level.props.push(prop);
    return {
      actorId: `prop:${id}`,
      fileKey: level.id,
      itemPath: `${level.id}.entities.props[${level.props.length - 1}]`,
      tab: 'entities',
    };
  }

  if (preset === 'enemy') {
    const enemyIds = new Set(level.enemies.map((e) => e.id));
    const id = uniqueName(enemyIds, 'bug');
    const fileName = uniqueName(fileNames, 'bug_script', '.py');
    const path = joinCwd(cwd, fileName);
    const fileSpec: LevelFileSpec = {
      path,
      kind: 'file',
      mode: 0o644,
      content: '# BUG: replace me\nprint("bug")\n',
    };
    const enemySpec: LevelEnemySpec = {
      id,
      type: 'bug',
      path,
      x,
      label: fileName,
    };
    level.files.push(fileSpec);
    level.enemies.push(enemySpec);
    return {
      actorId: id,
      fileKey: level.id,
      itemPath: `${level.id}.entities.enemies[${level.enemies.length - 1}]`,
      tab: 'entities',
    };
  }

  if (preset === 'door') {
    const name = uniqueName(fileNames, 'room');
    const path = joinCwd(cwd, name);
    level.files.push({
      path,
      kind: 'dir',
      mode: 0o755,
      model: 'door.usb',
      x,
      label: name,
    });
    return {
      actorId: `door:${name}`,
      fileKey: level.id,
      itemPath: `${level.id}.files.files[${level.files.length - 1}]`,
      tab: 'files',
    };
  }

  const name = uniqueName(fileNames, 'port', '.sock');
  const path = joinCwd(cwd, name);
  level.files.push({
    path,
    kind: 'socket',
    mode: 0o755,
    model: 'door.socket',
    x,
    label: name,
  });
  return {
    actorId: `sock:${name}`,
    fileKey: level.id,
    itemPath: `${level.id}.files.files[${level.files.length - 1}]`,
    tab: 'files',
  };
}
