import {
  CHAPTER_MANIFESTS,
  getChapterLevels,
  readChapterProgress,
  type ChapterProgressStore,
  type LevelClearRecord,
} from '../chapters/catalog.js';
import type { ChapterGrant, ChapterLevelSummary, ChapterManifest } from '../chapters/types.js';

export type ChipPackage = 'ROM-DIP8' | 'TASK-QFP16' | 'HUB-BGA24' | 'CORE-PGA64';
export type BlockStatus = 'current' | 'cleared' | 'ready' | 'unknown';

export interface MotherboardBlock {
  readonly level: ChapterLevelSummary;
  readonly summary: string;
  readonly chipPackage: ChipPackage;
  readonly status: BlockStatus;
  readonly record: LevelClearRecord | null;
  readonly grants: readonly string[];
  readonly coreGrant: string | null;
}

export interface MotherboardChannel {
  readonly index: number;
  readonly code: string;
  readonly busName: string;
  readonly busLabel: string;
  readonly taskBlocks: readonly MotherboardBlock[];
  readonly hubBlock: MotherboardBlock | null;
  readonly powered: boolean;
  readonly hasCurrent: boolean;
}

export interface MotherboardTopology {
  readonly manifest: ChapterManifest;
  readonly bootBlock: MotherboardBlock | null;
  readonly channels: readonly MotherboardChannel[];
  readonly coreBlocks: readonly MotherboardBlock[];
  readonly orderedBlocks: readonly MotherboardBlock[];
  readonly clearedCount: number;
  readonly totalCount: number;
}

export function resolveMapManifest(chapterId?: string, manifest?: ChapterManifest): ChapterManifest {
  if (manifest) return manifest;
  if (chapterId) {
    const found = CHAPTER_MANIFESTS.find((c) => c.id === chapterId);
    if (found) return found;
  }
  return CHAPTER_MANIFESTS[0]!;
}

function formatGrantBadges(grants: readonly ChapterGrant[], levelIndex: number): { badges: string[]; coreGrant: string | null } {
  const badges: string[] = [];
  let coreGrant: string | null = null;
  for (const grant of grants) {
    if (grant.afterLevel !== levelIndex) continue;
    if (grant.ram) badges.push(`+${grant.ram}GB RAM`);
    if (grant.ssd) badges.push(`+${grant.ssd}GB SSD`);
    if (grant.core) {
      coreGrant = grant.core.toUpperCase();
      badges.push(`CORE: ${coreGrant}`);
    }
    for (const item of grant.items ?? []) {
      badges.push(`ITEM: ${item.toUpperCase()}`);
    }
  }
  return { badges, coreGrant };
}

function packageFor(level: ChapterLevelSummary, isEntry: boolean): ChipPackage {
  if (level.mechanic === 'boss') return 'CORE-PGA64';
  if (level.mechanic === 'hub') return 'HUB-BGA24';
  if (isEntry) return 'ROM-DIP8';
  return 'TASK-QFP16';
}

function makeBlock(
  manifest: ChapterManifest,
  level: ChapterLevelSummary,
  summaryById: ReadonlyMap<string, string>,
  chapterProgress: Record<string, LevelClearRecord>,
  currentLevelId: string | null,
  isEntry: boolean,
  isOpened: boolean,
): MotherboardBlock {
  const record = chapterProgress[level.id] ?? null;
  const status: BlockStatus =
    level.id === currentLevelId
      ? 'current'
      : record?.cleared
        ? 'cleared'
        : isOpened
          ? 'ready'
          : 'unknown';
  const { badges, coreGrant } = formatGrantBadges(manifest.grants ?? [], level.index);
  return {
    level,
    summary: summaryById.get(level.id) ?? level.mechanicLabel,
    chipPackage: packageFor(level, isEntry),
    status,
    record,
    grants: badges,
    coreGrant,
  };
}

function buildChannel(index: number, taskBlocks: MotherboardBlock[], hubBlock: MotherboardBlock | null): MotherboardChannel {
  const busLetter = String.fromCharCode(65 + index);
  const code = `CH-${String(index + 1).padStart(2, '0')}`;
  const busName = `BUS ${busLetter}`;
  const core = hubBlock?.coreGrant;
  const busLabel = core ? `${busName} -> CORE: ${core}` : `${busName} // DATA`;
  const all = hubBlock ? [...taskBlocks, hubBlock] : taskBlocks;
  const hasCurrent = all.some((b) => b.status === 'current');
  const powered = all.some((b) => b.status === 'current' || b.status === 'cleared' || b.status === 'ready');
  return { index, code, busName, busLabel, taskBlocks, hubBlock, powered, hasCurrent };
}

/**
 * Organizes any declarative chapter manifest into a 4-stage PCB motherboard:
 * Boot ROM -> Data Channels (consecutive task blocks -> Hub Controller block) -> CPU Core Socket.
 */
export function buildMotherboardTopology(
  manifest: ChapterManifest,
  progress: ChapterProgressStore = readChapterProgress(),
  currentLevelId: string | null = null,
): MotherboardTopology {
  const fullLevels = getChapterLevels(manifest.id);
  const summaryById = new Map(fullLevels.map((l) => [l.id, l.summary]));
  const chapterProgress = progress[manifest.id] ?? {};

  const blocks = manifest.levels.map((lvl, i) => {
    const prev = i > 0 ? manifest.levels[i - 1] : undefined;
    const isOpened = i === 0 || Boolean(prev && chapterProgress[prev.id]?.cleared);
    return makeBlock(
      manifest,
      lvl,
      summaryById,
      chapterProgress,
      currentLevelId,
      i === 0 && lvl.mechanic !== 'hub' && lvl.mechanic !== 'boss',
      isOpened,
    );
  });

  let cursor = 0;
  let bootBlock: MotherboardBlock | null = null;
  if (blocks[0] && blocks[0].level.mechanic !== 'hub' && blocks[0].level.mechanic !== 'boss') {
    bootBlock = blocks[0];
    cursor = 1;
  }

  const channels: MotherboardChannel[] = [];
  const coreBlocks: MotherboardBlock[] = [];
  let pendingTasks: MotherboardBlock[] = [];

  for (; cursor < blocks.length; cursor += 1) {
    const block = blocks[cursor]!;
    if (block.level.mechanic === 'boss') {
      if (pendingTasks.length > 0) {
        channels.push(buildChannel(channels.length, pendingTasks, null));
        pendingTasks = [];
      }
      coreBlocks.push(block);
    } else if (block.level.mechanic === 'hub') {
      channels.push(buildChannel(channels.length, pendingTasks, block));
      pendingTasks = [];
    } else {
      pendingTasks.push(block);
    }
  }
  if (pendingTasks.length > 0) {
    channels.push(buildChannel(channels.length, pendingTasks, null));
  }

  const clearedCount = blocks.filter((b) => b.record?.cleared).length;
  return {
    manifest,
    bootBlock,
    channels,
    coreBlocks,
    orderedBlocks: blocks,
    clearedCount,
    totalCount: blocks.length,
  };
}

/** Matches `map <query>` by 1-based index, `boot`, `hub`, `boss`/`core`, id, title, cwd, or grant core. */
export function resolveLevelByQuery(
  manifest: ChapterManifest,
  query?: string | number | null,
  fallbackLevelId?: string | null,
): ChapterLevelSummary {
  const levels = manifest.levels;
  const fallback =
    (fallbackLevelId ? levels.find((l) => l.id === fallbackLevelId) : undefined) ?? levels[0]!;
  if (typeof query === 'number' && Number.isFinite(query)) {
    const idx = Math.max(0, Math.min(levels.length - 1, Math.round(query) - 1));
    return levels[idx] ?? fallback;
  }
  const clean = String(query ?? '').trim().toLowerCase();
  if (!clean) return fallback;

  const num = Number(clean.replace(/^(?:lvl|level|l|#|-)+/, ''));
  if (/^\d+$/.test(clean) || (/^(?:lvl|level|l|#)\s*0*\d+$/.test(clean) && Number.isInteger(num))) {
    const hit = levels.find((l) => l.index === num);
    if (hit) return hit;
  }
  if (clean === 'boot' || clean === 'tutorial') return levels[0] ?? fallback;
  if (clean === 'boss' || clean === 'core') return levels.find((l) => l.mechanic === 'boss') ?? fallback;
  if (clean === 'hub') return levels.find((l) => l.mechanic === 'hub') ?? fallback;

  const exactId = levels.find((l) => l.id.toLowerCase() === clean);
  if (exactId) return exactId;

  for (const grant of manifest.grants ?? []) {
    if (grant.core && grant.core.toLowerCase() === clean) {
      const target = levels.find((l) => l.index === grant.afterLevel);
      if (target) return target;
    }
  }

  return (
    levels.find(
      (l) =>
        l.id.toLowerCase().includes(clean) ||
        l.title.toLowerCase().includes(clean) ||
        l.cwd.toLowerCase().includes(clean) ||
        l.mechanicLabel.toLowerCase().includes(clean) ||
        l.teaches.some((t) => t.toLowerCase().includes(clean)),
    ) ?? fallback
  );
}
