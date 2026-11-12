import {
  GENERATED_COMIX_BY_CHAPTER,
  GENERATED_DIALOGS_BY_CHAPTER,
  GENERATED_LEVELS_BY_CHAPTER,
  GENERATED_MANIFESTS,
} from './generated/catalog-data.js';
import type {
  ChapterDialogs,
  ChapterLevelSummary,
  ChapterManifest,
  ChapterPack,
  ComixStorySpec,
  DossierEntry,
  LevelSpec,
} from './types.js';

export const CHAPTER_MANIFESTS: readonly ChapterManifest[] = GENERATED_MANIFESTS;

export function getChapterManifest(chapterId: string): ChapterManifest | undefined {
  return CHAPTER_MANIFESTS.find((c) => c.id === chapterId);
}

export function getChapterLevels(chapterId: string): LevelSpec[] {
  return GENERATED_LEVELS_BY_CHAPTER[chapterId] ?? [];
}

export function getChapterComix(chapterId: string): ComixStorySpec | undefined {
  return GENERATED_COMIX_BY_CHAPTER[chapterId];
}

export function getChapterDialogs(chapterId: string): ChapterDialogs | undefined {
  return GENERATED_DIALOGS_BY_CHAPTER[chapterId];
}

/** The compiled chapter as one pack, or undefined when the chapter has no playable levels. */
export function getChapterPack(chapterId: string): ChapterPack | undefined {
  const manifest = getChapterManifest(chapterId);
  const levels = getChapterLevels(chapterId);
  if (!manifest || levels.length === 0) return undefined;
  return { manifest, levels, dialogs: getChapterDialogs(chapterId), comix: getChapterComix(chapterId) };
}

export interface PlayUrlOptions {
  tactical?: boolean;
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
  if (opts?.tactical) params.set('tactical', '1');
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

export interface RigPerkSpec {
  id: string;
  title: string;
  bashrcLine: string;
  costScrap: number;
  effectSummary: string;
}

export const RIG_PERKS: readonly RigPerkSpec[] = [
  {
    id: 'perk-overclock-dimm',
    title: 'Overclocked Starter DIMM',
    bashrcLine: 'export RIG_RAM_BOOT=16',
    costScrap: 40,
    effectSummary: '+16 GB RAM (+10 Max HP) pre-installed at the start of every mission.',
  },
  {
    id: 'perk-nvme-snapshot',
    title: 'NVMe Rescue Partition',
    bashrcLine: 'export RIG_SSD_RESCUE=256',
    costScrap: 60,
    effectSummary: '+256 GB SSD (1 instant in-place respawn backup) on every mission.',
  },
  {
    id: 'perk-linter-goggles',
    title: 'Dotfile Linter Goggles',
    bashrcLine: 'export PS_LANTERN=1',
    costScrap: 50,
    effectSummary: 'Auto-illuminates hidden dotfiles & rootkits upon entering each sector.',
  },
];

export interface GrimoireEntry {
  command: string;
  category: 'POSIX' | 'HTML/CSS' | 'JS/CODE' | 'DOCKER';
  syntax: string;
  realWorld: string;
  comicEffect: string;
}

export const GRIMOIRE_ENTRIES: readonly GrimoireEntry[] = [
  {
    command: 'ls',
    category: 'POSIX',
    syntax: 'ls -la',
    realWorld: 'Lists directory contents including hidden `.dotfiles` and octal/rwx permissions.',
    comicEffect: 'Raises the Lantern sweep—exposes cloaked `.spycam` spyware & `.poltergeist.lock` rootkits.',
  },
  {
    command: 'cat',
    category: 'POSIX',
    syntax: 'cat client_brief.txt | cat hank.tty.sock',
    realWorld: 'Streams file or Unix domain socket output to stdout.',
    comicEffect: 'Reads contracts/configs or opens Socratic comic dialogue with mentor `hank.tty`.',
  },
  {
    command: 'rm',
    category: 'POSIX',
    syntax: 'rm .env.ai_dump port_445/worm.bin',
    realWorld: 'Unlinks files from their parent directory inode.',
    comicEffect: 'Shreds exposed secret dumps, lockfiles, and file-bound worms.',
  },
  {
    command: 'chmod',
    category: 'POSIX',
    syntax: 'chmod +rx ssl_certs | chmod -x skimmer.bin | chmod -w proxy.buf',
    realWorld: 'Modifies read (`r`), write (`w`), and execute (`x`) permission bits.',
    comicEffect: 'Unlocks `000` cert vaults, petrifies trojans into harmless stone, and starves buffer exploits.',
  },
  {
    command: 'ps',
    category: 'POSIX',
    syntax: 'ps | top',
    realWorld: 'Snapshots active processes, PIDs, PPIDs, and CPU load.',
    comicEffect: 'Activates `PS_XRAY` HUD tags over live malware processes so you can target their PID.',
  },
  {
    command: 'kill',
    category: 'POSIX',
    syntax: 'kill -9 <PID> | kill -STOP <PID>',
    realWorld: 'Delivers POSIX signals (`SIGKILL` = `-9`, `SIGTERM` = `-15`, `SIGSTOP` = freeze).',
    comicEffect: 'Calls a comic lightning bolt onto traps-SIGTERM viruses, cracks, and ransomware.',
  },
  {
    command: 'grep',
    category: 'POSIX',
    syntax: 'grep ORDER_SIG stripe_audit.log > payment_verify.sock',
    realWorld: 'Filters lines matching a pattern and redirects stdout into files or sockets.',
    comicEffect: 'Extracts verified payment tokens out of noisy logs straight into socket locks.',
  },
  {
    command: 'sed',
    category: 'JS/CODE',
    syntax: "sed -i 's|old|new|g' store.conf",
    realWorld: 'Non-interactive stream editor; supports any delimiter (`s/a/b/` or `s|url1|url2|`).',
    comicEffect: 'Patches broken ports, config flags, and code bugs in a single speedrun keystroke.',
  },
  {
    command: 'edit',
    category: 'HTML/CSS',
    syntax: 'edit storefront.css | edit cart.js',
    realWorld: 'Opens the Split Code Mini-Editor inside the terminal dock (`Ctrl+S` saves & lints).',
    comicEffect: 'Restores hidden CSS `.product-grid` cards, fixes JS string-concatenation math, and squashes `malware.bug`.',
  },
  {
    command: 'docker build',
    category: 'DOCKER',
    syntax: 'docker build -t byterig-web:1.0 . && docker run -d -p 3000:3000 byterig-web:1.0',
    realWorld: 'Builds an immutable container image from a `Dockerfile` and maps host->container ports.',
    comicEffect: 'Replaces hallucinated `node:99-vibe-turbo` layers and materializes `[UP]` container crates on stage.',
  },
  {
    command: 'docker compose',
    category: 'DOCKER',
    syntax: 'docker compose config && docker compose up -d',
    realWorld: 'Validates and orchestrates multi-container networks (`nginx` + `website` + `payment`) with DNS discovery.',
    comicEffect: 'Wires `http://payment:4002` across containers and spawns all 3 healthy service crates.',
  },
  {
    command: 'workshop',
    category: 'POSIX',
    syntax: 'workshop [buy|toggle <perk>]',
    realWorld: 'Manages persistent `.bashrc` workstation upgrades purchased with Silicon Scrap.',
    comicEffect: 'Equips Overclocked Starter RAM, NVMe Rescue Backups, or Dotfile Linter Goggles.',
  },
  {
    command: 'kiro',
    category: 'POSIX',
    syntax: 'kiro [scan | load <qwen|mistral|deepseek|llama> | crack <lock>] | cat <file> | kiro',
    realWorld: 'Runs air-gapped, self-hosted `.gguf` open-weights inference locally on your own GPU VRAM.',
    comicEffect: 'Unfolds your Destiny-style Kiro Ghost shell to scan rooms, hot-swap cores, audit files, and decrypt Cloud locks!',
  },
];

export type BestiaryDossierEntry = DossierEntry;

/** Cards every chapter shares (engine companions and the malware roster). A chapter adds its own through `manifest.dossier`. */
export const BESTIARY_DOSSIER: readonly DossierEntry[] = [
  {
    id: 'hank.tty',
    name: 'hank.tty (1978 Greybeard Spirit)',
    model: 'door.socket',
    role: 'ALLY',
    hostHardware: 'Vintage RS-232 / Unix domain socket with phosphor status LEDs.',
    counterplay: '`hank` or `cat hank.tty.sock` for 3-rung Socratic hints; `echo status > hank.tty.sock` for live audit.',
  },
  {
    id: 'kiro.d',
    name: 'kiro.d ("Little Weights" Ghost Companion)',
    model: 'npc.kiro_ghost',
    role: 'ALLY',
    hostHardware: 'Classic white sheet Kiro Ghost with scalloped hem folds, dark oval eyes with cyan .gguf iris sparks, and orbiting gold VRAM shards.',
    counterplay: '`kiro scan` sweeps threats; `kiro load <qwen|mistral|deepseek|llama>` boots open-weight models to disable the Big Four; `kiro crack <lock>` decrypts Cloud gates.',
  },
  {
    id: 'spyware',
    name: 'Cloaked Spycam (.spycam)',
    model: 'malware.spyware',
    role: 'MALWARE',
    hostHardware: 'Hidden dotfile camera lens lurking in repo dark corners.',
    counterplay: 'Reveal with `ls -la` (Lantern), then `rm .spycam`.',
  },
  {
    id: 'rootkit',
    name: 'Poltergeist Lock (.poltergeist.lock)',
    model: 'malware.rootkit',
    role: 'MALWARE',
    hostHardware: 'Sub-floor kernel latch hiding as a dotfile.',
    counterplay: 'Sweep with `ls -la`, then `rm .poltergeist.lock`.',
  },
  {
    id: 'bug',
    name: 'Code Bug (seed_products.py / cart.js)',
    model: 'malware.bug',
    role: 'MALWARE',
    hostHardware: 'Six-legged IC centipede living inside broken source code; respawns if `kill`ed!',
    counterplay: 'Patch the bug in source code via `edit <file>` or `sed -i`.',
  },
  {
    id: 'crack',
    name: 'Keygen Lockpick (keygen.exe)',
    model: 'malware.crack',
    role: 'MALWARE',
    hostHardware: 'Bent jumper-pin lockpick process reopening vulnerable ports.',
    counterplay: 'Check `ps` for its PID and run `kill -9 <PID>` before cleaning the port.',
  },
  {
    id: 'worm',
    name: 'Port Worm (worm.bin)',
    model: 'malware.worm',
    role: 'MALWARE',
    hostHardware: 'Segmented ribbon-cable crawler replicating through open port directories.',
    counterplay: 'Kill any helper crack process, then `rm port_445/worm.bin` or `chmod 000` its port.',
  },
  {
    id: 'virus',
    name: ' Trap-SIGTERM Virus (virus.exe)',
    model: 'malware.virus',
    role: 'MALWARE',
    hostHardware: 'Spiked heatsink phage that shrugs off polite `SIGTERM` (`kill -15`).',
    counterplay: 'Run `ps` and execute `kill -9 <PID>` (`SIGKILL` cannot be trapped).',
  },
  {
    id: 'trojan',
    name: 'Price Skimmer Trojan (price_skimmer.bin)',
    model: 'malware.trojan',
    role: 'MALWARE',
    hostHardware: 'Gift-wrapped capacitor disguising a credential/cart skimmer.',
    counterplay: 'Strip its execute bit with `chmod -x price_skimmer.bin` to petrify it into stone!',
  },
  {
    id: 'ransomware',
    name: 'Padlock Ransomware (ransom.exe)',
    model: 'malware.ransomware',
    role: 'MALWARE',
    hostHardware: 'Chained padlock daemon encrypting files in the Docker build context.',
    counterplay: 'Find its PID with `ps`, terminate with `kill -9 <PID>`, and `chmod 644` any locked files.',
  },
  {
    id: 'exploit',
    name: 'Buffer Overflow Exploit (port_hijack.bin)',
    model: 'malware.exploit',
    role: 'MALWARE',
    hostHardware: 'Root-escalated syringe injecting shellcode into a writable `.buf` file.',
    counterplay: 'Make its target buffer read-only (`chmod -w proxy.buf`) so it segfaults!',
  },
  {
    id: 'kernel',
    name: 'Slop-Weaver Code-X (slop_supervisor.ko, PID 1)',
    model: 'boss.kernel',
    role: 'BOSS',
    hostHardware: 'Monolithic autonomous AI supervisor gripping live cart checkout.',
    counterplay: '1) Drain `.stream` -> `/dev/null`, 2) Pipe `ORDER_SIG` -> `payment_verify.sock`, 3) Flip `slop_override=false`, 4) `exit`!',
  },
];

export interface MetagameStore {
  scrap: number;
  unlockedPerks: string[];
  activePerks: string[];
  seenMalware: string[];
  usedCommands: string[];
  awardedRanks: Record<string, RankGrade>;
}

const PROGRESS_KEY = 'haunted-terminal:progress:v1';
const METAGAME_KEY = 'haunted-terminal:metagame:v1';
const RANK_WEIGHT: Record<RankGrade, number> = { C: 1, B: 2, A: 3, S: 4 };
const SCRAP_BY_RANK: Record<RankGrade, number> = { C: 25, B: 45, A: 70, S: 100 };

function freshMetagame(): MetagameStore {
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

function writeMetagame(next: MetagameStore): void {
  memoryMetagame = next;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(METAGAME_KEY, JSON.stringify(next));
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
    return {
      ok: true,
      action: 'purchased',
      message: `Installed "${perk.title}" (${perk.bashrcLine}) into ~/.bashrc! Remaining Silicon Scrap: ${meta.scrap}.`,
      metagame: meta,
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
  let scrapEarned = 0;
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
