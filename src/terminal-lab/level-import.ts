import { CHAPTER_MANIFESTS, getChapterPack } from '../chapters/catalog.js';
import { readDraftPack } from '../chapters/draft.js';
import type { ChapterPack, LevelFileSpec, LevelSpec, ScriptStep } from '../chapters/types.js';
import type { LabPlayer, LabScript, LabSetupOp, LabStep } from './lab-types.js';
import { uniqueLabId, validateLab } from './store.js';

export interface ImportableLevel {
  /** `<chapterId>/<levelId>`, suitable for `<select>` values and `?from=<ref>`. */
  ref: string;
  chapterId: string;
  chapterTitle: string;
  levelId: string;
  index: number;
  title: string;
}

/** Every playable chapter level compiled into the game, in chapter and level order. Never touches `chapters/` on disk. */
export function listImportableLevels(): ImportableLevel[] {
  const out: ImportableLevel[] = [];
  for (const manifest of CHAPTER_MANIFESTS) {
    const pack = getChapterPack(manifest.id);
    if (!pack) continue;
    for (const level of pack.levels) {
      out.push({
        ref: `${manifest.id}/${level.id}`,
        chapterId: manifest.id,
        chapterTitle: manifest.title,
        levelId: level.id,
        index: level.index,
        title: level.title,
      });
    }
  }
  return out;
}

function playerAtLevel(pack: ChapterPack, level: LevelSpec): LabPlayer {
  const found = pack.levels.findIndex((l) => l.id === level.id);
  const idx = found >= 0 ? found : Math.max(0, level.index - 1);
  let ram = 0;
  let ssd = 0;
  let core = '';
  for (const grant of pack.manifest.grants ?? []) {
    if (idx < grant.afterLevel) continue;
    ram += grant.ram ?? 0;
    ssd += grant.ssd ?? 0;
    if (grant.core) core = grant.core;
  }
  return { ram, ssd, core };
}

function fileOp(f: LevelFileSpec): LabSetupOp {
  const shared = {
    path: f.path,
    ...(f.mode !== undefined ? { mode: f.mode } : {}),
    ...(f.uid !== undefined ? { uid: f.uid } : {}),
  };
  if (f.kind === 'dir') return { op: 'dir', ...shared };
  if (f.kind === 'socket') return { op: 'socket', ...shared, ...(f.content !== undefined ? { content: f.content } : {}) };
  return { op: 'file', ...shared, ...(f.questCritical ? { questCritical: true } : {}), content: f.content ?? '' };
}

function arrivalOps(pack: ChapterPack, level: LevelSpec): LabSetupOp[] {
  const out: LabSetupOp[] = [];
  for (const step of (level.script?.arrival ?? []) as ScriptStep[]) {
    if (step.kind === 'say') {
      out.push({ op: 'npc', agent: step.agent, mood: step.mood, text: step.text, ...(step.print ? { print: step.print } : {}) });
    } else if (step.kind === 'taunt') {
      const text = step.fallback ?? pack.dialogs?.levels[level.id]?.agentTaunt ?? '';
      if (text) out.push({ op: 'taunt', mood: step.mood, text, ...(step.print ? { print: step.print } : {}) });
    } else if (step.kind === 'dialogue') {
      const { kind: _kind, ...rest } = step;
      out.push({ op: 'dialogue', ...structuredClone(rest) });
    }
  }
  return out;
}

function nextFreeTaskId(used: Set<string>, start: number): string {
  for (let n = start; ; n += 1) {
    const candidate = `task-${n}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/**
 * Copies one chapter `LevelSpec` into an independent `LabScript` (files, enemies, pickups, patches, arrival speech, win rules
 * and solution steps). Pure and read-only toward `chapters/`: edits in the lab never touch the chapter.
 */
export function levelToLabScript(pack: ChapterPack, level: LevelSpec, takenIds: readonly string[] = []): LabScript {
  const setup: LabSetupOp[] = [];
  const usedIds = new Set<string>();
  for (const f of level.files ?? []) setup.push(fileOp(f));
  for (const e of level.enemies ?? []) {
    usedIds.add(e.id);
    setup.push({ op: 'enemy', ...structuredClone(e) });
  }
  for (const p of level.pickups ?? []) {
    usedIds.add(p.id);
    setup.push({ op: 'pickup', ...structuredClone(p) });
  }
  for (const patch of level.patches ?? []) setup.push({ op: 'patch', ...structuredClone(patch) });
  for (const p of level.props ?? []) {
    const id = usedIds.has(p.id) ? nextFreeTaskId(usedIds, 1) : p.id;
    usedIds.add(id);
    setup.push({
      op: 'prop',
      id,
      model: p.model,
      x: p.x,
      ...(p.y !== undefined ? { y: p.y } : {}),
      ...(p.label ? { label: p.label } : {}),
    });
  }
  setup.push(...arrivalOps(pack, level));

  const taskIds: string[] = [];
  (level.winRules ?? []).forEach((rule, i) => {
    const id = nextFreeTaskId(usedIds, i + 1);
    taskIds.push(id);
    setup.push({ op: 'task', id, rule: structuredClone(rule) });
  });

  const sol = level.solutionCommands ?? [];
  const exitGateCmd = level.exitDir ? `cd ${level.exitDir.split('/').pop() ?? ''}` : null;
  const lines = sol.filter((cmd, i) => {
    if (i !== sol.length - 1) return true;
    const trimmed = cmd.trim();
    return trimmed !== exitGateCmd && trimmed !== level.exitCommand;
  });
  const steps: LabStep[] = [
    ...lines.map((line): LabStep => ({ op: 'run', line, expect: { code: 0 } })),
    ...taskIds.map((id): LabStep => ({ op: 'check', id })),
  ];

  return {
    id: uniqueLabId(level.id, takenIds),
    title: level.title,
    room: {
      roomKind: level.roomKind,
      floorTheme: level.floorTheme,
      mechanic: level.mechanic,
      cwd: level.cwd,
      title: level.title,
      summary: level.summary,
    },
    player: playerAtLevel(pack, level),
    clock: 'manual',
    enemyFire: level.mechanic === 'hub' || level.script?.safe ? 'hold' : 'live',
    setup,
    steps,
  };
}

function tryImportFromPack(pack: ChapterPack, levelId: string, takenIds: readonly string[]): LabScript | null {
  try {
    const level = pack.levels.find((l) => l?.id === levelId);
    if (!level) return null;
    const script = levelToLabScript(pack, level, takenIds);
    return validateLab(script).length === 0 ? script : null;
  } catch {
    return null;
  }
}

/** Resolves `<chapterId>/<levelId>` (preferring `/editor`'s unsaved draft when `useDraft` is true) into a fresh `LabScript`. */
export function importChapterLevelRef(
  ref: string,
  takenIds: readonly string[],
  useDraft = false,
): { script?: LabScript; problem?: string } {
  const slash = ref.indexOf('/');
  const chapterId = slash > 0 ? ref.slice(0, slash) : '';
  const levelId = slash > 0 ? ref.slice(slash + 1) : '';
  if (!chapterId || !levelId) return { problem: `expected "<chapterId>/<levelId>", got "${ref}"` };
  const draftPack = useDraft ? readDraftPack(chapterId) : null;
  const compiledPack = getChapterPack(chapterId);
  if (!draftPack && !compiledPack) return { problem: `no chapter "${chapterId}"` };
  const fromDraft = draftPack ? tryImportFromPack(draftPack, levelId, takenIds) : null;
  if (fromDraft) return { script: fromDraft };
  const fromCompiled = compiledPack ? tryImportFromPack(compiledPack, levelId, takenIds) : null;
  if (fromCompiled) return { script: fromCompiled };
  return { problem: `no level "${levelId}" in "${chapterId}"` };
}
