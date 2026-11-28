import type { KernelEvent } from '../contracts/events.js';
import { ITEM_IDS, isItemId } from '../contracts/inventory.js';
import { PICKUP_TYPES } from '../game/bestiary.js';
import { resolveKiroCoreId } from '../game/kiro.js';
import { isRec } from './record.js';
import { STEAM_RELEASE_META, scheduleDesktopSaveSync } from './steam-bridge.js';
import type { ChapterMechanic } from './types.js';

export type AchievementCategory = 'CAMPAIGN' | 'COMBAT' | 'CRAFT' | 'MASTERY';
export type AchievementEvent = Extract<KernelEvent, { type: 'ACHIEVEMENT_UNLOCKED' }>;

export interface AchievementSpec {
  readonly id: string;
  /** Exact 1:1 Steamworks Partner Admin API name (`UPPER_SNAKE_CASE`). */
  readonly steamApiName: string;
  readonly title: string;
  readonly description: string;
  readonly hiddenDescription?: string;
  readonly category: AchievementCategory;
  readonly icon: string;
  readonly secret?: boolean;
  readonly statKey?: string;
}

export const ACHIEVEMENT_SPECS: readonly AchievementSpec[] = [
  {
    id: 'first_boot',
    steamApiName: 'ACH_FIRST_BOOT',
    title: 'Boot Sequence',
    description: 'Clear the opening onboarding sector and step deeper into the machine.',
    category: 'CAMPAIGN',
    icon: '>_',
    statKey: 'STAT_SECTORS_CLEARED',
  },
  {
    id: 'lantern_sweep',
    steamApiName: 'ACH_LANTERN_SWEEP',
    title: 'Dotfile Exorcist',
    description: 'Sweep a dark directory with your Tube Transistor (`ls -a` / `ls -la`) or `kiro scan` to expose hidden dotfiles.',
    category: 'COMBAT',
    icon: 'LS',
  },
  {
    id: 'field_manual',
    steamApiName: 'ACH_FIELD_MANUAL',
    title: 'Read The Fine Manual',
    description: 'Receive the Unix Field Manual and Motherboard Map from the Old Bearded Coder at the Server Hub.',
    category: 'CAMPAIGN',
    icon: 'FM',
  },
  {
    id: 'sigkill_hunter',
    steamApiName: 'ACH_SIGKILL_HUNTER',
    title: 'Untrappable Signal',
    description: 'Terminate a live malware process with `SIGKILL` (`kill -9`).',
    category: 'COMBAT',
    icon: '-9',
    statKey: 'STAT_MALWARE_KILLED',
  },
  {
    id: 'stone_cold_chmod',
    steamApiName: 'ACH_STONE_COLD_CHMOD',
    title: 'Permission Denied',
    description: 'Petrify or neutralize executable malware by stripping permissions with `chmod`.',
    category: 'COMBAT',
    icon: '000',
  },
  {
    id: 'open_weights_init',
    steamApiName: 'ACH_OPEN_WEIGHTS_INIT',
    title: 'Local Weights Online',
    description: 'Hot-swap your first air-gapped `.gguf` open-weight model into Kiro.d.',
    category: 'CRAFT',
    icon: 'GG',
  },
  {
    id: 'full_stack_fixer',
    steamApiName: 'ACH_FULL_STACK_FIXER',
    title: 'Full-Stack Firefighter',
    description: 'Clear JavaScript, Dockerfile, and Docker Compose repair sectors.',
    category: 'CRAFT',
    icon: 'FX',
  },
  {
    id: 'big_four_silenced',
    steamApiName: 'ACH_BIG_FOUR_SILENCED',
    title: 'Air-Gapped Sovereignty',
    description: 'Boot `qwen`, `deepseek`, and `llama` cores across server hubs to silence rival agents.',
    category: 'CAMPAIGN',
    icon: '[4]',
  },
  {
    id: 'bashrc_artisan',
    steamApiName: 'ACH_BASHRC_ARTISAN',
    title: 'Dotfiles Artisan',
    description: 'Unlock a persistent `~/.bashrc` workstation upgrade in the Rig Workshop.',
    category: 'CRAFT',
    icon: 'RC',
  },
  {
    id: 'chaos_contractor',
    steamApiName: 'ACH_CHAOS_CONTRACTOR',
    title: 'Chaos Contractor',
    description: 'Clear any sector while a `cron_chaos` Chaos Contract is active.',
    category: 'MASTERY',
    icon: '*!',
  },
  {
    id: 'speed_demon_s',
    steamApiName: 'ACH_SPEED_DEMON_S',
    title: 'One-Liner Virtuoso',
    description: 'Earn an `S` Rank on any sector with zero deaths and no spoiler hints.',
    category: 'MASTERY',
    icon: 'S',
    statKey: 'STAT_S_RANKS',
  },
  {
    id: 'full_loadout',
    steamApiName: 'ACH_FULL_LOADOUT',
    title: 'Full Loadout',
    description: 'Obtain all 5 developer inventory items (`tube_transistor`, `terminal`, `laptop`, `manual`, `map`).',
    category: 'CRAFT',
    icon: '5/5',
  },
  {
    id: 'hardware_hoarder',
    steamApiName: 'ACH_HARDWARE_HOARDER',
    title: 'Hardware Hoarder',
    description: 'Collect every hardware pickup type (`energy`, `ram`, `ssd`, `tube_transistor`, `laptop`).',
    category: 'MASTERY',
    icon: '++',
  },
  {
    id: 'campaign_clear',
    steamApiName: 'ACH_CAMPAIGN_CLEAR',
    title: 'Open Weights & Family Ties',
    description: 'Defeat the Kernel Boss, run `exit`, and uncover who was guiding you on the hub socket.',
    hiddenDescription: 'Defeat the final Kernel supervisor and `exit` the machine.',
    category: 'CAMPAIGN',
    icon: 'EX',
    secret: true,
  },
  {
    id: 'zero_panic_run',
    steamApiName: 'ACH_ZERO_PANIC_RUN',
    title: 'Zero Kernel Panics',
    description: 'Complete an entire campaign run with 0 deaths and an overall `S` Rank.',
    hiddenDescription: 'Finish a full campaign run at peak efficiency without a single crash.',
    category: 'MASTERY',
    icon: '0!',
    secret: true,
  },
];

const SPEC_BY_ID = new Map(ACHIEVEMENT_SPECS.map((s) => [s.id, s]));
const REQUIRED_STACK_MECHANICS: readonly ChapterMechanic[] = ['terminal-code', 'docker-image', 'docker-compose'];
const REQUIRED_HUB_CORES = ['qwen', 'deepseek', 'llama'] as const;
const ACHIEVEMENTS_STORAGE_KEY = 'out-of-credits:achievements:v1';
/** Items and pickups of the Tensor GPU ritual: not part of the "full loadout" and "hardware hoarder" trophies (their Steam text is fixed). */
const NON_ACHIEVEMENT: ReadonlySet<string> = new Set(['tensor_gpu', 'vram_module']);

export interface UnlockedAchievement {
  id: string;
  steamApiName: string;
  unlockedAt: number;
}

export interface AchievementStats {
  malwareKilled: number;
  sectorsCleared: number;
  sRanksEarned: number;
  clearedMechanics: string[];
  loadedCores: string[];
  collectedItems: string[];
  collectedPickups: string[];
}

export interface AchievementStore {
  schemaVersion: 1;
  unlocked: Record<string, UnlockedAchievement>;
  stats: AchievementStats;
}

function freshStats(): AchievementStats {
  return {
    malwareKilled: 0,
    sectorsCleared: 0,
    sRanksEarned: 0,
    clearedMechanics: [],
    loadedCores: [],
    collectedItems: [],
    collectedPickups: [],
  };
}

export function freshAchievementStore(): AchievementStore {
  return { schemaVersion: 1, unlocked: {}, stats: freshStats() };
}

let memoryAchievements: AchievementStore = freshAchievementStore();

export function resetAchievementsForTest(): void {
  memoryAchievements = freshAchievementStore();
}

function sanitizeStringList(v: unknown, maxLen = 32): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.length > 0 && item.length <= 64 && !out.includes(item)) {
      out.push(item);
      if (out.length >= maxLen) break;
    }
  }
  return out;
}

function nonNegInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function normalizeLegacyItemList(v: unknown): string[] {
  const mapped = Array.isArray(v) ? v.map((x) => (x === 'lantern' ? 'tube_transistor' : x)) : [];
  return sanitizeStringList(mapped);
}

export function sanitizeAchievementStore(raw: unknown): AchievementStore {
  if (!isRec(raw)) return freshAchievementStore();
  const unlocked: Record<string, UnlockedAchievement> = {};
  if (isRec(raw.unlocked)) {
    for (const spec of ACHIEVEMENT_SPECS) {
      const entry = raw.unlocked[spec.id];
      if (isRec(entry)) {
        const at = nonNegInt(entry.unlockedAt) || Date.now();
        unlocked[spec.id] = { id: spec.id, steamApiName: spec.steamApiName, unlockedAt: at };
      }
    }
  }
  const st = isRec(raw.stats) ? raw.stats : {};
  return {
    schemaVersion: 1,
    unlocked,
    stats: {
      malwareKilled: nonNegInt(st.malwareKilled),
      sectorsCleared: nonNegInt(st.sectorsCleared),
      sRanksEarned: nonNegInt(st.sRanksEarned),
      clearedMechanics: sanitizeStringList(st.clearedMechanics),
      loadedCores: sanitizeStringList(st.loadedCores),
      collectedItems: normalizeLegacyItemList(st.collectedItems),
      collectedPickups: normalizeLegacyItemList(st.collectedPickups),
    },
  };
}

export function readAchievements(): AchievementStore {
  if (typeof localStorage === 'undefined') return sanitizeAchievementStore(memoryAchievements);
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (!raw) return freshAchievementStore();
    return sanitizeAchievementStore(JSON.parse(raw));
  } catch {
    return sanitizeAchievementStore(memoryAchievements);
  }
}

export function writeAchievements(next: AchievementStore): void {
  const clean = sanitizeAchievementStore(next);
  memoryAchievements = clean;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(clean));
    scheduleDesktopSaveSync();
  } catch {
    // Ignore storage quota errors in restricted/private mode
  }
}

function toEvent(spec: AchievementSpec): AchievementEvent {
  return {
    type: 'ACHIEVEMENT_UNLOCKED',
    id: spec.id,
    steamApiName: spec.steamApiName,
    title: spec.title,
    description: spec.description,
    icon: spec.icon,
  };
}

function grantInStore(store: AchievementStore, id: string, now = Date.now()): AchievementEvent | null {
  const spec = SPEC_BY_ID.get(id);
  if (!spec || store.unlocked[id]) return null;
  store.unlocked[id] = { id: spec.id, steamApiName: spec.steamApiName, unlockedAt: now };
  return toEvent(spec);
}

export function unlockAchievement(id: string, opts?: { preview?: boolean; lab?: boolean; now?: number }): AchievementEvent | null {
  if (opts?.preview || opts?.lab) return null;
  const store = readAchievements();
  const ev = grantInStore(store, id, opts?.now);
  if (ev) writeAchievements(store);
  return ev;
}

/** Whether the player has obtained the Unix Field Manual in the campaign (`ACH_FIELD_MANUAL`). */
export function isManualUnlocked(store: AchievementStore = readAchievements()): boolean {
  return Boolean(store.unlocked.field_manual);
}

export function formatAchievementLines(unlocked: readonly AchievementEvent[]): string {
  if (unlocked.length === 0) return '';
  const lines = unlocked.map(
    (u) => `[* ACHIEVEMENT UNLOCKED] ${u.title} (${u.steamApiName}) — ${u.description}`,
  );
  return `\n${lines.join('\n')}\n`;
}

export function evaluateBatchEvents(
  events: readonly KernelEvent[],
  opts?: { preview?: boolean; lab?: boolean },
): AchievementEvent[] {
  if (opts?.preview || opts?.lab || events.length === 0) return [];
  const store = readAchievements();
  const out: AchievementEvent[] = [];
  let dirty = false;
  const tryGrant = (id: string): void => {
    const ev = grantInStore(store, id);
    if (ev) {
      out.push(ev);
      dirty = true;
    }
  };

  const recordItem = (item: string): void => {
    if (!store.stats.collectedItems.includes(item)) {
      store.stats.collectedItems.push(item);
      dirty = true;
    }
    if (ITEM_IDS.filter((id) => !NON_ACHIEVEMENT.has(id)).every((id) => store.stats.collectedItems.includes(id))) {
      tryGrant('full_loadout');
    }
  };
  const recordPickup = (pickup: string): void => {
    if (!store.stats.collectedPickups.includes(pickup)) {
      store.stats.collectedPickups.push(pickup);
      dirty = true;
    }
    if (PICKUP_TYPES.filter((p) => !NON_ACHIEVEMENT.has(p)).every((p) => store.stats.collectedPickups.includes(p))) {
      tryGrant('hardware_hoarder');
    }
  };

  for (const ev of events) {
    if (ev.type === 'LANTERN_REVEAL') {
      if (ev.revealedInodes.length > 0) tryGrant('lantern_sweep');
    } else if (ev.type === 'ITEM_GIVEN') {
      if (ev.item === 'manual') tryGrant('field_manual');
      recordItem(ev.item);
    } else if (ev.type === 'PICKUP_COLLECTED') {
      recordPickup(ev.item);
      if (isItemId(ev.item)) recordItem(ev.item);
    } else if (ev.type === 'ENEMY_KILLED') {
      store.stats.malwareKilled += 1;
      dirty = true;
      if (ev.how === 'SIGKILL') tryGrant('sigkill_hunter');
      if (ev.how === 'chmod') tryGrant('stone_cold_chmod');
    } else if (ev.type === 'ENEMY_STATE' && ev.state === 'petrified') {
      tryGrant('stone_cold_chmod');
    } else if (ev.type === 'KIRO_ACTION' && ev.action === 'load') {
      tryGrant('open_weights_init');
      const resolvedCore = resolveKiroCoreId(ev.core);
      if (resolvedCore && (REQUIRED_HUB_CORES as readonly string[]).includes(resolvedCore) && !store.stats.loadedCores.includes(resolvedCore)) {
        store.stats.loadedCores.push(resolvedCore);
        dirty = true;
      }
      if (REQUIRED_HUB_CORES.every((c) => store.stats.loadedCores.includes(c))) {
        tryGrant('big_four_silenced');
      }
    }
  }
  if (dirty) writeAchievements(store);
  return out;
}

export interface PresentedAchievement {
  id: string;
  steamApiName: string;
  icon: string;
  category: AchievementCategory;
  unlocked: boolean;
  unlockedAt: number | null;
  hidden: boolean;
  title: string;
  description: string;
}

export function presentAchievement(spec: AchievementSpec, store: AchievementStore): PresentedAchievement {
  const hit = store.unlocked[spec.id];
  const hidden = Boolean(spec.secret && !hit);
  return {
    id: spec.id,
    steamApiName: spec.steamApiName,
    icon: spec.icon,
    category: spec.category,
    unlocked: Boolean(hit),
    unlockedAt: hit ? hit.unlockedAt : null,
    hidden,
    title: hidden ? '???? (Secret Achievement)' : spec.title,
    description: hidden ? (spec.hiddenDescription ?? 'Keep playing to reveal.') : spec.description,
  };
}

export interface SessionEvalContext {
  preview?: boolean;
  lab?: boolean;
}

export function evaluateLevelClearAchievements(
  input: SessionEvalContext & { openingSector: boolean; mechanic: ChapterMechanic; rank: 'C' | 'B' | 'A' | 'S'; chaos: boolean },
): AchievementEvent[] {
  if (input.preview || input.lab) return [];
  const store = readAchievements();
  const out: AchievementEvent[] = [];
  store.stats.sectorsCleared += 1;
  if (input.mechanic && !store.stats.clearedMechanics.includes(input.mechanic)) {
    store.stats.clearedMechanics.push(input.mechanic);
  }
  const pushIfNew = (id: string): void => {
    const ev = grantInStore(store, id);
    if (ev) out.push(ev);
  };
  if (input.openingSector) pushIfNew('first_boot');
  if (REQUIRED_STACK_MECHANICS.every((m) => store.stats.clearedMechanics.includes(m))) {
    pushIfNew('full_stack_fixer');
  }
  if (input.chaos) pushIfNew('chaos_contractor');
  if (input.rank === 'S') {
    store.stats.sRanksEarned += 1;
    pushIfNew('speed_demon_s');
  }
  writeAchievements(store);
  return out;
}

export function evaluateRunEndAchievements(
  run: SessionEvalContext & { rank: 'C' | 'B' | 'A' | 'S'; deaths: number; fullRun?: boolean },
): AchievementEvent[] {
  if (run.preview || run.lab) return [];
  const store = readAchievements();
  const ids = run.fullRun !== false && run.deaths === 0 && run.rank === 'S' ? ['campaign_clear', 'zero_panic_run'] : ['campaign_clear'];
  const out = ids.map((id) => grantInStore(store, id)).filter((e): e is AchievementEvent => e !== null);
  if (out.length > 0) writeAchievements(store);
  return out;
}

export function evaluateWorkshopAchievement(purchased: boolean, preview = false): AchievementEvent[] {
  if (!purchased || preview) return [];
  const ev = unlockAchievement('bashrc_artisan', { preview });
  return ev ? [ev] : [];
}

export interface SteamworksExportPayload {
  schemaVersion: 1;
  steamAppId: number | null;
  unlockedCount: number;
  totalCount: number;
  steamApiNames: string[];
  achievements: Array<{
    id: string;
    steamApiName: string;
    title: string;
    category: AchievementCategory;
    unlocked: boolean;
    unlockedAt: number | null;
  }>;
  stats: AchievementStats;
}

export function exportSteamAchievementPayload(storeOverride?: AchievementStore): SteamworksExportPayload {
  const store = storeOverride ?? readAchievements();
  const list = ACHIEVEMENT_SPECS.map((spec) => {
    const view = presentAchievement(spec, store);
    return {
      id: spec.id,
      steamApiName: spec.steamApiName,
      title: view.title,
      category: spec.category,
      unlocked: view.unlocked,
      unlockedAt: view.unlockedAt,
    };
  });
  const unlockedList = list.filter((a) => a.unlocked);
  return {
    schemaVersion: 1,
    steamAppId: storeOverride ? null : STEAM_RELEASE_META.steamAppId,
    unlockedCount: unlockedList.length,
    totalCount: ACHIEVEMENT_SPECS.length,
    steamApiNames: unlockedList.map((a) => a.steamApiName),
    achievements: list,
    stats: store.stats,
  };
}
