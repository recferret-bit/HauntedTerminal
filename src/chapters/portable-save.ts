import { LEGACY_SLUG } from '../contracts/brand.js';
import {
  ACHIEVEMENT_SPECS,
  freshAchievementStore,
  readAchievements,
  sanitizeAchievementStore,
  writeAchievements,
  type AchievementStore,
} from './achievements.js';
import {
  RIG_PERKS,
  freshMetagame,
  readChapterProgress,
  readMetagame,
  writeChapterProgress,
  writeMetagame,
  type ChapterProgressStore,
  type LevelClearRecord,
  type MetagameStore,
  type RankGrade,
} from './catalog.js';
import { isRec } from './record.js';
import {
  downloadJsonBlob,
  isTauriDesktop,
  readDesktopSaveBundle,
  registerDesktopSaveProvider,
  scheduleDesktopSaveSync,
  syncSteamAchievements,
  withDesktopSaveSyncSuppressed,
} from './steam-bridge.js';

/** Save files exported before the rename carry the old format string; they still import. */
const LEGACY_SAVE_FORMAT = `${LEGACY_SLUG}-save`;

function isSaveFormat(format: unknown): boolean {
  return format === 'out-of-credits-save' || format === LEGACY_SAVE_FORMAT;
}

export interface PortableSaveBundle {
  format: 'out-of-credits-save';
  version: 1;
  exportedAt: string;
  progress: ChapterProgressStore;
  metagame: MetagameStore;
  achievements: AchievementStore;
}

const VALID_RANKS = new Set<RankGrade>(['C', 'B', 'A', 'S']);
const RANK_SCORE: Record<RankGrade, number> = { C: 1, B: 2, A: 3, S: 4 };
const VALID_PERK_IDS = new Set(RIG_PERKS.map((p) => p.id));
const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
]);

function isSafeRecordKey(key: string, maxLen: number): boolean {
  return key.length > 0 && key.length <= maxLen && !FORBIDDEN_KEYS.has(key);
}

function safeInt(v: unknown, fallback = 0, max = 1_000_000): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return fallback;
  return Math.min(max, Math.floor(v));
}

function safeTokenList(v: unknown, maxItems = 64): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && isSafeRecordKey(x, 64) && !out.includes(x)) {
      out.push(x);
      if (out.length >= maxItems) break;
    }
  }
  return out;
}

function mergeLevelRecord(a: LevelClearRecord | undefined, b: LevelClearRecord): LevelClearRecord {
  if (!a) return b;
  return {
    cleared: Boolean(a.cleared || b.cleared),
    bestRank: RANK_SCORE[b.bestRank] >= RANK_SCORE[a.bestRank] ? b.bestRank : a.bestRank,
    bestCommands: Math.min(a.bestCommands, b.bestCommands),
    bestTimeSec: Math.min(a.bestTimeSec, b.bestTimeSec),
    chaosCleared: Boolean(a.chaosCleared || b.chaosCleared),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

function parseProgress(raw: unknown, current: ChapterProgressStore): { merged: ChapterProgressStore; sectors: number } {
  const merged: ChapterProgressStore = structuredClone(current);
  if (!isRec(raw)) return { merged, sectors: countClearedSectors(merged) };
  for (const [chapId, levelsRaw] of Object.entries(raw)) {
    if (!isSafeRecordKey(chapId, 80) || !isRec(levelsRaw)) continue;
    const chapMap: Record<string, LevelClearRecord> = Object.hasOwn(merged, chapId) ? { ...merged[chapId] } : {};
    for (const [lvlId, recRaw] of Object.entries(levelsRaw)) {
      if (!isSafeRecordKey(lvlId, 80) || !isRec(recRaw) || recRaw.cleared !== true) continue;
      const rank = VALID_RANKS.has(recRaw.bestRank as RankGrade) ? (recRaw.bestRank as RankGrade) : 'C';
      const rec: LevelClearRecord = {
        cleared: true,
        bestRank: rank,
        bestCommands: Math.max(1, safeInt(recRaw.bestCommands, 1)),
        bestTimeSec: Math.max(1, safeInt(recRaw.bestTimeSec, 1)),
        chaosCleared: Boolean(recRaw.chaosCleared),
        updatedAt: safeInt(recRaw.updatedAt, Date.now(), 9_999_999_999_999),
      };
      const prev = Object.hasOwn(chapMap, lvlId) ? chapMap[lvlId] : undefined;
      chapMap[lvlId] = mergeLevelRecord(prev, rec);
    }
    if (Object.keys(chapMap).length > 0) merged[chapId] = chapMap;
  }
  return { merged, sectors: countClearedSectors(merged) };
}

function mergeMetagame(raw: unknown, current: MetagameStore): MetagameStore {
  if (!isRec(raw)) return current;
  const unlockedPerks = [
    ...new Set([...current.unlockedPerks, ...safeTokenList(raw.unlockedPerks).filter((p) => VALID_PERK_IDS.has(p))]),
  ];
  const activePerks = [
    ...new Set([...current.activePerks, ...safeTokenList(raw.activePerks).filter((p) => unlockedPerks.includes(p))]),
  ];
  const awardedRanks: Record<string, RankGrade> = { ...current.awardedRanks };
  if (isRec(raw.awardedRanks)) {
    for (const [k, v] of Object.entries(raw.awardedRanks)) {
      if (!isSafeRecordKey(k, 140) || !VALID_RANKS.has(v as RankGrade)) continue;
      const prev = Object.hasOwn(awardedRanks, k) ? awardedRanks[k] : undefined;
      if (!prev || RANK_SCORE[v as RankGrade] > RANK_SCORE[prev]) awardedRanks[k] = v as RankGrade;
    }
  }
  return {
    scrap: Math.max(current.scrap, safeInt(raw.scrap, 0)),
    unlockedPerks,
    activePerks,
    seenMalware: [...new Set([...current.seenMalware, ...safeTokenList(raw.seenMalware)])],
    usedCommands: [...new Set([...current.usedCommands, ...safeTokenList(raw.usedCommands)])],
    awardedRanks,
  };
}

function mergeAchievements(raw: unknown, current: AchievementStore): AchievementStore {
  const incoming = sanitizeAchievementStore(raw);
  const unlocked = { ...current.unlocked };
  for (const spec of ACHIEVEMENT_SPECS) {
    const inc = incoming.unlocked[spec.id];
    if (!inc) continue;
    const prev = Object.hasOwn(unlocked, spec.id) ? unlocked[spec.id] : undefined;
    unlocked[spec.id] = prev
      ? { id: spec.id, steamApiName: spec.steamApiName, unlockedAt: Math.min(prev.unlockedAt, inc.unlockedAt) }
      : inc;
  }
  return {
    schemaVersion: 1,
    unlocked,
    stats: {
      malwareKilled: Math.max(current.stats.malwareKilled, incoming.stats.malwareKilled),
      sectorsCleared: Math.max(current.stats.sectorsCleared, incoming.stats.sectorsCleared),
      sRanksEarned: Math.max(current.stats.sRanksEarned, incoming.stats.sRanksEarned),
      clearedMechanics: [...new Set([...current.stats.clearedMechanics, ...incoming.stats.clearedMechanics])],
      loadedCores: [...new Set([...current.stats.loadedCores, ...incoming.stats.loadedCores])],
    },
  };
}

export function countClearedSectors(progress: ChapterProgressStore): number {
  let total = 0;
  for (const chap of Object.values(progress)) {
    if (!isRec(chap)) continue;
    for (const lvl of Object.values(chap)) {
      if (isRec(lvl) && lvl.cleared === true) total += 1;
    }
  }
  return total;
}

export function exportPortableSaveBundle(): PortableSaveBundle {
  return {
    format: 'out-of-credits-save',
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: readChapterProgress(),
    metagame: readMetagame(),
    achievements: readAchievements(),
  };
}

export function downloadPortableSaveFile(filename = 'out-of-credits-save.json'): PortableSaveBundle {
  const bundle = exportPortableSaveBundle();
  void downloadJsonBlob(filename, bundle);
  return bundle;
}

export async function exportPortableSaveFile(
  filename = 'out-of-credits-save.json',
): Promise<{ bundle: PortableSaveBundle; savedPath: string | null }> {
  const bundle = exportPortableSaveBundle();
  const savedPath = await downloadJsonBlob(filename, bundle);
  return { bundle, savedPath };
}

function applyPortableSaveJson(
  rawJson: string,
  fromDesktopHydration: boolean,
): {
  ok: boolean;
  changedLocal: boolean;
  message: string;
  unlockedCount: number;
  clearedSectors: number;
} {
  if (!rawJson || rawJson.length > 256_000) {
    return { ok: false, changedLocal: false, message: 'Save file is empty or exceeds the 256 KB limit.', unlockedCount: 0, clearedSectors: 0 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, changedLocal: false, message: 'Invalid JSON syntax in save bundle.', unlockedCount: 0, clearedSectors: 0 };
  }
  if (!isRec(parsed) || !isSaveFormat(parsed.format) || parsed.version !== 1) {
    return {
      ok: false,
      changedLocal: false,
      message: 'Expected an Out Of Credits save bundle (`format: "out-of-credits-save"`, `version: 1`).',
      unlockedCount: 0,
      clearedSectors: 0,
    };
  }
  const curProgress = readChapterProgress();
  const curMetagame = readMetagame();
  const curAchievements = readAchievements();
  const beforeSnap = JSON.stringify({ progress: curProgress, metagame: curMetagame, achievements: curAchievements });

  const { merged: progress, sectors } = parseProgress(parsed.progress, curProgress);
  const metagame = mergeMetagame(parsed.metagame, curMetagame);
  const achievements = mergeAchievements(parsed.achievements, curAchievements);
  const mergedSnap = JSON.stringify({ progress, metagame, achievements });
  const changedLocal = mergedSnap !== beforeSnap;

  let localAddedNewState = true;
  if (fromDesktopHydration) {
    const diskProg = parseProgress(parsed.progress, {}).merged;
    const diskMeta = mergeMetagame(parsed.metagame, freshMetagame());
    const diskAch = mergeAchievements(parsed.achievements, freshAchievementStore());
    const diskSnap = JSON.stringify({ progress: diskProg, metagame: diskMeta, achievements: diskAch });
    localAddedNewState = mergedSnap !== diskSnap;
  }

  withDesktopSaveSyncSuppressed(() => {
    writeChapterProgress(progress);
    writeMetagame(metagame);
    writeAchievements(achievements);
  });

  const apiNames = Object.values(achievements.unlocked).map((u) => u.steamApiName);
  if (!fromDesktopHydration || localAddedNewState) {
    scheduleDesktopSaveSync();
  }
  if (apiNames.length > 0 && (!fromDesktopHydration || changedLocal || localAddedNewState)) {
    void syncSteamAchievements(apiNames);
  }
  const unlockedCount = apiNames.length;
  return {
    ok: true,
    changedLocal,
    message: `Imported save bundle: ${unlockedCount}/${ACHIEVEMENT_SPECS.length} achievements unlocked, ${sectors} sector(s) cleared, ${metagame.scrap} Silicon Scrap.`,
    unlockedCount,
    clearedSectors: sectors,
  };
}

export function importPortableSaveBundle(rawJson: string): {
  ok: boolean;
  message: string;
  unlockedCount: number;
  clearedSectors: number;
} {
  const { ok, message, unlockedCount, clearedSectors } = applyPortableSaveJson(rawJson, false);
  return { ok, message, unlockedCount, clearedSectors };
}

/** Hydrates `<app_data_dir>/out-of-credits-save.json` into browser storage on Tauri / Steam Auto-Cloud boot without dirty-rewriting unchanged files. */
export async function hydrateFromDesktopSaveBundle(): Promise<boolean> {
  if (!isTauriDesktop()) return false;
  const raw = await readDesktopSaveBundle();
  if (!raw) return false;
  const res = applyPortableSaveJson(raw, true);
  return res.ok && res.changedLocal;
}

registerDesktopSaveProvider(() => `${JSON.stringify(exportPortableSaveBundle(), null, 2)}\n`);
