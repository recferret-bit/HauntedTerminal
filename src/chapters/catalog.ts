import {
  GENERATED_COMIX_BY_CHAPTER,
  GENERATED_DIALOGS_BY_CHAPTER,
  GENERATED_LEVELS_BY_CHAPTER,
  GENERATED_MANIFESTS,
} from './generated/catalog-data.js';
import {
  evaluateWorkshopAchievement,
  isManualUnlocked,
  readAchievements,
  resetAchievementsForTest,
  type AchievementEvent,
  type AchievementStore,
} from './achievements.js';
import { scheduleDesktopSaveSync } from './steam-bridge.js';
import {
  BESTIARY_DOSSIER,
  GRIMOIRE_ENTRIES,
  RIG_PERKS,
  type GrimoireEntry,
  type RigPerkSpec,
} from './metagame-data.js';
import type {
  ChapterDialogs,
  ChapterLevelSummary,
  ChapterManifest,
  ChapterPack,
  ComixStorySpec,
  DossierEntry,
  LevelSpec,
} from './types.js';

export { BESTIARY_DOSSIER, GRIMOIRE_ENTRIES, RIG_PERKS, type GrimoireEntry, type RigPerkSpec };

import type * as GeneratedCatalogMod from './generated/catalog-data.js';

type GeneratedChapterCatalog = typeof GeneratedCatalogMod;

const chapterManifests: ChapterManifest[] = [...GENERATED_MANIFESTS];
let levelsMap = GENERATED_LEVELS_BY_CHAPTER;
let comixMap = GENERATED_COMIX_BY_CHAPTER;
let dialogsMap = GENERATED_DIALOGS_BY_CHAPTER;

export const CHAPTER_MANIFESTS: readonly ChapterManifest[] = chapterManifests;

import.meta.hot?.accept('./generated/catalog-data.js', (updated) => {
  const data = updated as GeneratedChapterCatalog | undefined;
  if (!data) return;
  chapterManifests.length = 0;
  chapterManifests.push(...data.GENERATED_MANIFESTS);
  levelsMap = data.GENERATED_LEVELS_BY_CHAPTER;
  comixMap = data.GENERATED_COMIX_BY_CHAPTER;
  dialogsMap = data.GENERATED_DIALOGS_BY_CHAPTER;
});

export function getChapterManifest(chapterId: string): ChapterManifest | undefined {
  return CHAPTER_MANIFESTS.find((c) => c.id === chapterId);
}

export function getChapterLevels(chapterId: string): LevelSpec[] {
  return levelsMap[chapterId] ?? [];
}

export function getChapterComix(chapterId: string): ComixStorySpec | undefined {
  return comixMap[chapterId];
}

export function getChapterDialogs(chapterId: string): ChapterDialogs | undefined {
  return dialogsMap[chapterId];
}

/** The compiled chapter as one pack, or undefined when the chapter has no playable levels. */
export function getChapterPack(chapterId: string): ChapterPack | undefined {
  const manifest = getChapterManifest(chapterId);
  const levels = getChapterLevels(chapterId);
  if (!manifest || levels.length === 0) return undefined;
  return { manifest, levels, dialogs: getChapterDialogs(chapterId), comix: getChapterComix(chapterId) };
}

export interface PlayUrlOptions {
  chaos?: boolean;
  seed?: string;
  dev?: boolean;
  /** Force the intro cinematic on a level after the first. */
  intro?: boolean;
}

/** `/play/<chapter>/<level>` or `/play/<chapter>/floor/<n>`. Mode flags stay on the query string. */
export function buildPlayUrl(
  chapterId: string,
  level?: ChapterLevelSummary | string,
  noIntro = false,
  opts?: PlayUrlOptions,
): string {
  const parts = ['/play', encodeURIComponent(chapterId)];
  if (typeof level === 'string') {
    parts.push(encodeURIComponent(level));
  } else if (level) {
    parts.push(encodeURIComponent(level.id));
  }
  const params = new URLSearchParams();
  if (noIntro) params.set('nointro', '1');
  if (opts?.chaos) params.set('chaos', '1');
  if (opts?.seed) params.set('seed', opts.seed);
  if (opts?.dev) params.set('dev', '1');
  if (opts?.intro) params.set('intro', '1');
  const query = params.toString();
  return query ? `${parts.join('/')}?${query}` : parts.join('/');
}

/** The shared cards plus the ones the chapter declares. */
export function dossierOf(manifest?: ChapterManifest): readonly DossierEntry[] {
  return [...BESTIARY_DOSSIER, ...(manifest?.dossier ?? [])];
}

export type RankGrade = 'C' | 'B' | 'A' | 'S';

export interface LevelClearRecord {
  cleared: boolean;
  bestRank: RankGrade;
  bestCommands: number;
  bestTimeSec: number;
  chaosCleared?: boolean;
  updatedAt: number;
}

export type ChapterProgressStore = Record<string, Record<string, LevelClearRecord>>;

export interface MetagameStore {
  scrap: number;
  unlockedPerks: string[];
  activePerks: string[];
  seenMalware: string[];
  usedCommands: string[];
  awardedRanks: Record<string, RankGrade>;
}

const PROGRESS_KEY = 'out-of-credits:progress:v1';
const METAGAME_KEY = 'out-of-credits:metagame:v1';
const RANK_WEIGHT: Record<RankGrade, number> = { C: 1, B: 2, A: 3, S: 4 };
const SCRAP_BY_RANK: Record<RankGrade, number> = { C: 25, B: 45, A: 70, S: 100 };

export function freshMetagame(): MetagameStore {
  return {
    scrap: 0,
    unlockedPerks: [],
    activePerks: [],
    seenMalware: ['hank.tty'],
    usedCommands: ['ls', 'cat', 'cd'],
    awardedRanks: {},
  };
}

let memoryProgress: ChapterProgressStore = {};
let memoryMetagame: MetagameStore = freshMetagame();

export function resetInMemoryStoresForTest(): void {
  memoryProgress = {};
  memoryMetagame = freshMetagame();
  resetAchievementsForTest();
}

export function writeChapterProgress(next: ChapterProgressStore): void {
  memoryProgress = next;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
    scheduleDesktopSaveSync();
  } catch {
    // Ignore storage quota errors in private mode
  }
}

/** True when the chapter has at least one cleared level in the saved progress: the player is past a new game. */
export function hasChapterProgress(progress: ChapterProgressStore, chapterId: string): boolean {
  return Object.values(progress[chapterId] ?? {}).some((rec) => rec.cleared);
}

export function readChapterProgress(): ChapterProgressStore {
  if (typeof localStorage === 'undefined') return memoryProgress;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as ChapterProgressStore) : {};
  } catch {
    return memoryProgress;
  }
}

export function readMetagame(): MetagameStore {
  if (typeof localStorage === 'undefined') return memoryMetagame;
  try {
    const raw = localStorage.getItem(METAGAME_KEY);
    if (!raw) return freshMetagame();
    const parsed = JSON.parse(raw) as Partial<MetagameStore>;
    return {
      scrap: typeof parsed.scrap === 'number' ? parsed.scrap : 0,
      unlockedPerks: Array.isArray(parsed.unlockedPerks) ? parsed.unlockedPerks : [],
      activePerks: Array.isArray(parsed.activePerks) ? parsed.activePerks : [],
      seenMalware: Array.isArray(parsed.seenMalware) ? parsed.seenMalware : ['hank.tty'],
      usedCommands: Array.isArray(parsed.usedCommands) ? parsed.usedCommands : ['ls', 'cat', 'cd'],
      awardedRanks: parsed.awardedRanks && typeof parsed.awardedRanks === 'object' ? parsed.awardedRanks : {},
    };
  } catch {
    return memoryMetagame;
  }
}

export function writeMetagame(next: MetagameStore): void {
  memoryMetagame = next;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(METAGAME_KEY, JSON.stringify(next));
    scheduleDesktopSaveSync();
  } catch {
    // Ignore storage quota errors in private mode
  }
}

export function recordTelemetry(update: { commands?: string[]; malware?: string[] }): void {
  const meta = readMetagame();
  let changed = false;
  for (const c of update.commands ?? []) {
    if (c && !meta.usedCommands.includes(c)) {
      meta.usedCommands.push(c);
      changed = true;
    }
  }
  for (const m of update.malware ?? []) {
    if (m && !meta.seenMalware.includes(m)) {
      meta.seenMalware.push(m);
      changed = true;
    }
  }
  if (changed) writeMetagame(meta);
}

export function purchaseOrTogglePerk(perkId: string): {
  ok: boolean;
  action: 'purchased' | 'enabled' | 'disabled' | 'error';
  message: string;
  metagame: MetagameStore;
  unlockedAchievements?: AchievementEvent[];
} {
  const perk = RIG_PERKS.find((p) => p.id === perkId || p.id.endsWith(perkId));
  const meta = readMetagame();
  if (!perk) {
    return {
      ok: false,
      action: 'error',
      message: `Unknown perk "${perkId}". Available: ${RIG_PERKS.map((p) => p.id).join(', ')}`,
      metagame: meta,
    };
  }
  if (!meta.unlockedPerks.includes(perk.id)) {
    if (meta.scrap < perk.costScrap) {
      return {
        ok: false,
        action: 'error',
        message: `Need ${perk.costScrap} Silicon Scrap for "${perk.title}" (have ${meta.scrap} Scrap). Clear levels or Chaos Contracts to earn more!`,
        metagame: meta,
      };
    }
    meta.scrap -= perk.costScrap;
    meta.unlockedPerks.push(perk.id);
    if (!meta.activePerks.includes(perk.id)) meta.activePerks.push(perk.id);
    writeMetagame(meta);
    const unlockedAchievements = evaluateWorkshopAchievement(true, false);
    return {
      ok: true,
      action: 'purchased',
      message: `Installed "${perk.title}" (${perk.bashrcLine}) into ~/.bashrc! Remaining Silicon Scrap: ${meta.scrap}.`,
      metagame: meta,
      unlockedAchievements,
    };
  }

  if (meta.activePerks.includes(perk.id)) {
    meta.activePerks = meta.activePerks.filter((id) => id !== perk.id);
    writeMetagame(meta);
    return {
      ok: true,
      action: 'disabled',
      message: `Commented out ${perk.bashrcLine} in ~/.bashrc (DISABLED).`,
      metagame: meta,
    };
  }
  meta.activePerks.push(perk.id);
  writeMetagame(meta);
  return {
    ok: true,
    action: 'enabled',
    message: `Enabled ${perk.bashrcLine} in ~/.bashrc (ACTIVE).`,
    metagame: meta,
  };
}

export function recordLevelClear(
  chapterId: string,
  levelId: string,
  rank: RankGrade,
  commands: number,
  timeSec: number,
  chaos = false,
): { scrapEarned: number; totalScrap: number } {
  const store = readChapterProgress();
  const byChapter = store[chapterId] ?? {};
  const prev = byChapter[levelId];
  const nextRank = !prev || RANK_WEIGHT[rank] >= RANK_WEIGHT[prev.bestRank] ? rank : prev.bestRank;
  byChapter[levelId] = {
    cleared: true,
    bestRank: nextRank,
    bestCommands: prev ? Math.min(prev.bestCommands, commands) : commands,
    bestTimeSec: prev ? Math.min(prev.bestTimeSec, timeSec) : timeSec,
    chaosCleared: Boolean(prev?.chaosCleared || chaos),
    updatedAt: Date.now(),
  };
  store[chapterId] = byChapter;
  memoryProgress = store;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(store));
    } catch {
      // Ignore storage quota errors in private mode
    }
  }

  const meta = readMetagame();
  const key = `${chapterId}:${levelId}`;
  const prevAwarded = meta.awardedRanks[key];
  let scrapEarned: number;
  if (!prevAwarded) {
    scrapEarned = SCRAP_BY_RANK[rank];
    meta.awardedRanks[key] = rank;
  } else if (RANK_WEIGHT[rank] > RANK_WEIGHT[prevAwarded]) {
    scrapEarned = SCRAP_BY_RANK[rank] - SCRAP_BY_RANK[prevAwarded];
    meta.awardedRanks[key] = rank;
  } else {
    scrapEarned = 10; // Replay maintenance bounty
  }
  if (chaos) scrapEarned += 25;
  meta.scrap += scrapEarned;
  writeMetagame(meta);
  return { scrapEarned, totalScrap: meta.scrap };
}

/** True once `ACH_FIELD_MANUAL` is earned or saved progress has cleared any sector that grants `manual`. */
export function isFieldManualAvailable(
  achStore: AchievementStore = readAchievements(),
  progress: ChapterProgressStore = readChapterProgress(),
): boolean {
  if (isManualUnlocked(achStore)) return true;
  for (const manifest of chapterManifests) {
    const chapProg = progress[manifest.id];
    if (!chapProg) continue;
    for (const grant of manifest.grants ?? []) {
      if (!grant.items?.includes('manual') || grant.afterLevel <= 0) continue;
      if (manifest.levels.some((lvl) => lvl.index >= grant.afterLevel && chapProg[lvl.id]?.cleared)) {
        return true;
      }
    }
  }
  return false;
}
