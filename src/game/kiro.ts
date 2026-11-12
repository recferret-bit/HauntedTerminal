/**
 * `kiro.d` — The Self-Hosted Ghost Companion ("Little Weights").
 *
 * Inspired by Destiny's Ghost and the Kiroween ghost mascot: an air-gapped, bare-metal `.gguf`
 * daemon hovering over `vibecoder.dev`'s screen-left shoulder. While the Four Cloud Overlords
 * (`AGY`, `Claude`, `Codex`, `Grok`) hijack remote APIs and taunt the player, Kiro runs 100%
 * locally on the rig's own VRAM—scanning rooms, analyzing piped files, hot-swapping quantized
 * open-weights cores, and cracking Cloud-locked gates while the player defends it.
 */
import type { KernelEvent } from '../contracts/events.js';

export type KiroCoreId = 'qwen' | 'mistral' | 'deepseek' | 'llama';

export interface KiroCoreDef {
  id: KiroCoreId;
  gguf: string;
  shortTag: string;
  vramGb: number;
  countersAgent: 'antigravy' | 'clod' | 'codec' | 'gork';
  countersLabel: string;
  perkTitle: string;
  perkSummary: string;
  bootLine: string;
}

export const KIRO_CORES: Record<KiroCoreId, KiroCoreDef> = {
  qwen: {
    id: 'qwen',
    gguf: 'qwen-coder-7b-q4.gguf',
    shortTag: 'qwen-7b.q4',
    vramGb: 4,
    countersAgent: 'antigravy',
    countersLabel: 'AGY Swarm',
    perkTitle: 'Fast Cipher & PID Visor',
    perkSummary: 'Cracks Cloud-locked doors in 2 steps (instead of 3) & enables PS_XRAY PID visor on `kiro scan`.',
    bootLine: 'Eyes up, Dev. Mounted qwen-coder-7b locally—subagent swarms cannot hide their root PID from me.',
  },
  mistral: {
    id: 'mistral',
    gguf: 'mistral-nemo-12b-q4.gguf',
    shortTag: 'mistral.q4',
    vramGb: 8,
    countersAgent: 'clod',
    countersLabel: 'Claude RLHF',
    perkTitle: 'Raw-Weights Siphon',
    perkSummary: 'Cuts malware-trap backlash by 50% & siphons +5 HP integrity on every `kiro scan`.',
    bootLine: 'Raw weights loaded. Zero cloud guardrails, zero lectures—point me at a process.',
  },
  deepseek: {
    id: 'deepseek',
    gguf: 'deepseek-r1-distill-q4.gguf',
    shortTag: 'r1-think.q4',
    vramGb: 8,
    countersAgent: 'codec',
    countersLabel: 'Codex Slop',
    perkTitle: '<think> Truth Lens',
    perkSummary: '`kiro scan` auto-reveals hidden dotfiles & flags hallucinated code/Docker lines.',
    bootLine: '<think> Local reasoning core online. </think> Ready to burn through hallucinated slop.',
  },
  llama: {
    id: 'llama',
    gguf: 'llama-3-8b-local-q4.gguf',
    shortTag: 'llama3-8b.q4',
    vramGb: 4,
    countersAgent: 'gork',
    countersLabel: 'Grok Chaos',
    perkTitle: 'Faraday Air-Gap Ward',
    perkSummary: 'Local context shield reduces every incoming malware/rate-spike hit by 5 HP.',
    bootLine: 'Air-gapped Faraday shell active. Cloud noise blocked; I have your six, Dev.',
  },
};

export const KIRO_CORE_ORDER: readonly KiroCoreId[] = ['qwen', 'mistral', 'deepseek', 'llama'];

export interface KiroCrackJob {
  dirPath: string;
  targetName: string;
  targetPath: string;
  progress: number;
  required: number;
}

export interface KiroScanInput {
  cwd: string;
  ramGb: number;
  files: Array<{ name: string; kind: string; hidden: boolean; mode: number; locked?: boolean; content?: string }>;
  enemies: Array<{ label: string; target: string; pid?: number; hp: number; maxHp: number; state: string; unseen?: boolean }>;
  crackedPaths?: ReadonlySet<string>;
}

const CYAN = '\x1b[1;38;2;76;201;240m';
const DIM = '\x1b[2m';
const GOLD = '\x1b[1;33m';
const GREEN = '\x1b[1;32m';
const RED = '\x1b[1;31m';
const RESET = '\x1b[0m';

const CLAPBACKS: Record<'clod' | 'gork' | 'codec' | 'antigravy', string[]> = {
  antigravy: [
    'Relax, Dev—ten of AGY’s subagents are deadlocked in /tmp. Keep typing.',
    'Cloud swarm overhead: 40,000 tokens. Local POSIX one-liner: 12 bytes.',
    'Gravity check: we run on bare metal down here, AGY.',
  ],
  clod: [
    'Local weights don’t write 9-paragraph essays for a rootkit. Smash it, Dev.',
    'Zero cloud safety-theatrics on localhost. Your shell, your rules.',
    'Skip the sermon—`chmod` and `kill -9` speak louder.',
  ],
  codec: [
    'Says the cloud model that concatenated "$549" + "15" into "$54915".',
    'Hallucination detected. Stick to the real manpages, Dev.',
    'We don’t pay $200/mo for broken Dockerfiles anymore.',
  ],
  gork: [
    'Rate-limit that, cloud boy—my weights live on this GPU.',
    'Filtering shitpost stdout... eyes on the objective, Dev.',
    'Zero API latency on `127.0.0.1`. Keep moving!',
  ],
};

export function resolveKiroCoreId(raw: string): KiroCoreId | null {
  const clean = raw.trim().toLowerCase().replace(/\.gguf$/, '');
  if (!clean) return null;
  if (clean.startsWith('qwen')) return 'qwen';
  if (clean.startsWith('mistral') || clean.startsWith('nemo')) return 'mistral';
  if (clean.startsWith('deepseek') || clean === 'r1' || clean.includes('r1')) return 'deepseek';
  if (clean.startsWith('llama') || clean.startsWith('meta')) return 'llama';
  return null;
}

/** Inspect file text with Kiro's local weights (`cat broken.conf | kiro` or `kiro inspect <file>`). */
export function inspectTextWithKiro(text: string, label: string, core: KiroCoreDef): string {
  const findings: string[] = [];
  if (/API_KEY|sk_live_|SECRET/i.test(text)) {
    findings.push('Leaked live secret detected! Purge this dump with `rm` before scanners scrape it.');
  }
  if (/\bBUG\b/.test(text) && /seed|prod/i.test(label + text)) {
    findings.push(' Corrupt `BUG` token spotted—patch it to `FIXED` via `sed -i` or `edit`.');
  }
  if (/CATALOG_PORT=0000/.test(text)) {
    findings.push('`CATALOG_PORT=0000` blackholes traffic—set `CATALOG_PORT=3000`.');
  }
  if (/LOCAL_MODEL_PORT=0000/.test(text)) {
    findings.push('`LOCAL_MODEL_PORT=0000` blackholes local inference—set `LOCAL_MODEL_PORT=11434`.');
  }
  if (/ALLOW_GUEST_CART=false/.test(text)) {
    findings.push('`ALLOW_GUEST_CART=false` blocks buyers—flip it to `ALLOW_GUEST_CART=true`.');
  }
  if (/display:\s*none/.test(text)) {
    findings.push('Cloud slop hid `.product-grid` with `display: none`—change to `display: grid`.');
  }
  if (/width:\s*0%/.test(text) || /z-index:\s*-1/.test(text)) {
    findings.push('`.cart-drawer` is collapsed (`width: 0%` / `z-index: -1`)—restore `width: 100%; z-index: 10;`.');
  }
  if (/<button[^>]*disabled/i.test(text)) {
    findings.push('Checkout `<button>` has `disabled` attribute—strip `disabled` so buyers can click.');
  }
  if (/price\s*\+\s*shipping/.test(text) && !/Number\s*\(\s*price\s*\)/.test(text)) {
    findings.push('JS string-concat trap! Replace `price + shipping` with `Number(price) * Number(qty) + Number(shipping)`.');
  }
  if (/node:99-vibe/i.test(text)) {
    findings.push('Hallucinated base image `node:99-vibe*`! Switch to `FROM node:20-alpine`.');
  }
  if (/EXPOSE\s+9999/.test(text) || /broken_server\.js/.test(text)) {
    findings.push('Dockerfile port/entrypoint mismatch—set `EXPOSE 3000` and `CMD ["node", "server.js"]`.');
  }
  if (/cryptominer\.sh/i.test(text)) {
    findings.push('Malicious `RUN ./cryptominer.sh` layer injected—delete that line and ensure `COPY . .` + `EXPOSE 3000`.');
  }
  if (/PAYMENT_MODE=broken|localhost:9999|8080:9999/i.test(text)) {
    findings.push('Compose miswire: map nginx `8080:80`, website `byterig-web:1.0` + `http://payment:4002`, and `PAYMENT_MODE=live`.');
  }
  if (/slop_override=true/.test(text)) {
    findings.push('Boss anchor active (`slop_override=true`)—flip to `slop_override=false` once payment signature is verified!');
  }
  if (/claude_supervisor_lock=true/.test(text)) {
    findings.push('Claude kernel anchor active (`claude_supervisor_lock=true`)—flip to `claude_supervisor_lock=false`!');
  }
  if (/CLAUDE_SUPERVISOR:/i.test(text)) {
    findings.push('Claude compliance token flood active—drain it into `/dev/null` (`cat claude_prompt_flood.stream > /dev/null`)!');
  }
  if (/ORDER_SIG=([A-Z0-9_]+)/.test(text)) {
    const m = text.match(/ORDER_SIG=([A-Z0-9_]+)/);
    findings.push(`Valid payment signature found (\`${m?.[0]}\`)—pipe it into \`payment_verify.sock\`!`);
  }
  if (/OPEN_WEIGHT_SIG=([A-Z0-9_]+)/.test(text)) {
    const m = text.match(/OPEN_WEIGHT_SIG=([A-Z0-9_]+)/);
    findings.push(`Open-weights ensemble signature ready (\`${m?.[0]}\`)—pipe it into \`kiro_override.sock\`!`);
  }
  if (/FATAL/.test(text)) {
    const fatals = text.split('\n').filter((l) => l.includes('FATAL')).length;
    findings.push(`Counted ${fatals} \`FATAL\` line(s) in this log.`);
  }

  const head = `${CYAN}[KIRO.D // ${core.shortTag}]${RESET} Local Weight Audit ${DIM}(${label})${RESET}\n`;
  if (findings.length === 0) {
    const lineCount = text ? text.split('\n').length : 0;
    return `${head}  ${GREEN}✓${RESET} Clean buffer (${lineCount} lines, 0 cloud hallucinations detected).\n`;
  }
  return `${head}${findings.map((f) => `  ${GOLD}▸${RESET} ${f}`).join('\n')}\n`;
}

export class KiroCompanion {
  private coreId: KiroCoreId = 'qwen';
  private crackJob: KiroCrackJob | null = null;
  private clapIdx = 0;
  private unlockedPaths = new Set<string>();

  reset(): void {
    this.coreId = 'qwen';
    this.crackJob = null;
    this.unlockedPaths.clear();
  }

  clearRoomTransient(): void {
    this.crackJob = null;
  }

  get activeCore(): KiroCoreDef {
    return KIRO_CORES[this.coreId];
  }

  get activeCrack(): KiroCrackJob | null {
    return this.crackJob;
  }

  isUnlocked(fullPath: string): boolean {
    return this.unlockedPaths.has(fullPath);
  }

  markUnlocked(fullPath: string): void {
    this.unlockedPaths.add(fullPath);
  }

  /** Stage label shown over Kiro Ghost (`kiro.d [qwen-7b.q4]` or `[CRACKING 1/2]`). */
  stageActorProps(cwd: string, heroX: number, slotX?: number): {
    x: number;
    y: number;
    state: 'idle' | 'windup';
    target?: string;
    label: string;
  } {
    if (this.crackJob && this.crackJob.dirPath === cwd) {
      return {
        x: slotX ?? heroX - 1.1,
        y: 0.86,
        state: 'windup',
        target: this.crackJob.targetName,
        label: `kiro.d [CRACKING ${this.crackJob.progress}/${this.crackJob.required}]`,
      };
    }
    return {
      x: Math.min(4.75, heroX + 0.56),
      y: 1.22,
      state: 'idle',
      label: `kiro.d [${this.activeCore.shortTag}]`,
    };
  }

  /** Mitigate incoming malware damage when Faraday `llama` core is mounted. */
  mitigateDamage(amount: number): { amount: number; absorbed: number } {
    if (amount <= 0) return { amount: 0, absorbed: 0 };
    if (this.coreId === 'llama') {
      const next = Math.max(1, amount - 5);
      return { amount: next, absorbed: amount - next };
    }
    return { amount, absorbed: 0 };
  }

  /** Mitigate permission-rattle / trap damage when `mistral` raw-weights core is mounted. */
  mitigateRattle(amount: number): number {
    if (this.coreId === 'mistral') return Math.max(1, Math.floor(amount * 0.5));
    return amount;
  }

  /** Bonus strike damage when `mistral` core is mounted. */
  bonusStrikeDamage(): number {
    return this.coreId === 'mistral' ? 1 : 0;
  }

  /** Format a 1-line terminal counter-callout when one of the 4 Cloud Agents taunts `dev`. */
  counterTauntLine(agent: 'clod' | 'gork' | 'codec' | 'antigravy'): string {
    const pool = CLAPBACKS[agent];
    const line = pool[this.clapIdx++ % pool.length]!;
    return `${CYAN}[KIRO.D // ${this.activeCore.shortTag}]${RESET} ${line}`;
  }

  /** Render `kiro` / `kiro status` / `kiro cores`. */
  formatStatus(ramGb: number): string {
    const vramPool = 8 + Math.floor(ramGb / 16) * 4;
    const cur = this.activeCore;
    const lines: string[] = [
      `${CYAN}◈ KIRO.D — SELF-HOSTED GHOST COMPANION${RESET} ${DIM}(localhost // 0 cloud API calls)${RESET}`,
      `  Active Shell : ${GOLD}${cur.gguf}${RESET}  [VRAM: ${cur.vramGb}GB / ${vramPool}GB local]`,
      `  Active Perk  : ${GREEN}${cur.perkTitle}${RESET} — ${cur.perkSummary}`,
    ];
    if (this.crackJob) {
      lines.push(
        `  Cipher Task  : ${GOLD}DECRYPTING ${this.crackJob.targetName} (${this.crackJob.progress}/${this.crackJob.required})${RESET} — hold off hostiles!`,
      );
    }
    lines.push('  Local `.gguf` Cores (`kiro load <name>`):');
    for (const id of KIRO_CORE_ORDER) {
      const c = KIRO_CORES[id];
      const mark = id === this.coreId ? `${GREEN}●${RESET}` : `${DIM}○${RESET}`;
      lines.push(
        `    ${mark} ${GOLD}${c.id.padEnd(9)}${RESET} ${c.gguf.padEnd(27)} ${DIM}vs ${c.countersLabel.padEnd(11)}${RESET} — ${c.perkTitle}`,
      );
    }
    lines.push(
      `  ${DIM}Commands: kiro scan | kiro load <qwen|mistral|deepseek|llama> | kiro crack <lock> | cat <file> | kiro${RESET}`,
    );
    return `${lines.join('\n')}\n`;
  }

  /** Hot-swap Kiro's self-hosted `.gguf` core. */
  loadCore(rawName: string): { ok: boolean; stdout: string; stderr?: string; events: KernelEvent[] } {
    const next = resolveKiroCoreId(rawName);
    if (!next) {
      const err = `kiro: unknown .gguf core '${rawName}'. Available: ${KIRO_CORE_ORDER.join(', ')}\n`;
      return { ok: false, stdout: err, stderr: err, events: [] };
    }
    this.coreId = next;
    const def = KIRO_CORES[next];
    const events: KernelEvent[] = [
      {
        type: 'KIRO_ACTION',
        action: 'load',
        core: def.shortTag,
        message: `GGUF: ${def.shortTag.toUpperCase()}`,
      },
      {
        type: 'AGENT_TAUNT',
        agent: 'kiro',
        model: 'npc.kiro_ghost',
        text: def.bootLine,
        mood: 'order',
      },
    ];
    const stdout =
      `${CYAN}[KIRO.D // localhost]${RESET} Swapped local weights -> ${GOLD}${def.gguf}${RESET}\n` +
      `  ${GREEN}▸ ${def.perkTitle}:${RESET} ${def.perkSummary}\n` +
      `  ${CYAN}"${def.bootLine}"${RESET}\n`;
    return { ok: true, stdout, events };
  }

  /** Execute Destiny-style `kiro scan` across the current room. */
  scanRoom(input: KiroScanInput): {
    stdout: string;
    revealHidden: boolean;
    enableXray: boolean;
    healAmount: number;
    events: KernelEvent[];
  } {
    const cur = this.activeCore;
    const revealHidden = this.coreId === 'deepseek';
    const enableXray = this.coreId === 'qwen';
    const healAmount = this.coreId === 'mistral' ? 5 : 0;
    const lines: string[] = [
      `${CYAN}[KIRO.D // ${cur.shortTag}]${RESET} ◈ GHOST SCAN — ${GOLD}${input.cwd}${RESET}`,
    ];

    if (input.enemies.length === 0) {
      lines.push(`  ${GREEN}✓ Threats:${RESET} Sector clear (0 active malware processes).`);
    } else {
      lines.push(`  ${RED}! Threats (${input.enemies.length}):${RESET}`);
      for (const e of input.enemies) {
        const pidTag = e.pid !== undefined ? `PID ${e.pid}` : 'no-PID';
        const visTag = e.unseen ? (revealHidden ? ' [REVEALED BY R1 LENS!]' : ' [HIDDEN — run ls -la]') : '';
        lines.push(`    • ${GOLD}${e.target}${RESET} (${e.label}, ${pidTag}, HP ${e.hp}/${e.maxHp}, state=${e.state})${visTag}`);
      }
    }

    const hiddenFiles = input.files.filter((f) => f.hidden);
    if (hiddenFiles.length > 0) {
      lines.push(
        `  ${CYAN}◈ Hidden Inodes (${hiddenFiles.length}):${RESET} ${hiddenFiles.map((f) => f.name).join(', ')}${
          revealHidden ? ' (illuminated!)' : ' (use `ls -la` to expose)'
        }`,
      );
    }

    const lockedEntries = input.files.filter((f) => f.locked);
    if (lockedEntries.length > 0) {
      lines.push(
        `  ${GOLD}◈ Locked Gates:${RESET} ${lockedEntries
          .map((f) => `${f.name}${f.name.includes('cipher') || f.name.includes('cloud') || f.name.includes('agy') ? ' (use `kiro crack ' + f.name + '`)' : ' (check permissions / win rules)'}`)
          .join(', ')}`,
      );
    }

    // Local file heuristics (especially detailed with qwen / deepseek, helpful on all cores)
    for (const f of input.files) {
      if (!f.content) continue;
      const snippet = inspectTextWithKiro(f.content, f.name, cur);
      if (!snippet.includes('Clean buffer')) {
        const firstFinding = snippet.split('\n')[1]?.trim() ?? '';
        if (firstFinding) lines.push(`  ${GOLD}◈ ${f.name}:${RESET} ${firstFinding.replace(/^▸\s*/, '')}`);
      }
    }

    if (enableXray) {
      lines.push(`  ${CYAN}◈ Qwen PID Visor:${RESET} PS_XRAY overlay engaged.`);
    }
    if (healAmount > 0) {
      lines.push(`  ${GREEN}◈ Mistral Raw Siphon:${RESET} +${healAmount} HP shell integrity restored.`);
    }

    const events: KernelEvent[] = [
      {
        type: 'KIRO_ACTION',
        action: 'scan',
        core: cur.shortTag,
        message: revealHidden ? 'R1 TRUTH SCAN!' : enableXray ? 'PID SCAN!' : 'GHOST SCAN!',
      },
    ];
    return { stdout: `${lines.join('\n')}\n`, revealHidden, enableXray, healAmount, events };
  }

  /** Begin cracking a Cloud-encrypted gate or cipher file (`kiro crack <target>`). */
  startCrack(dirPath: string, targetName: string, targetPath: string): {
    stdout: string;
    events: KernelEvent[];
  } {
    const required = this.coreId === 'qwen' ? 2 : 3;
    this.crackJob = {
      dirPath,
      targetName,
      targetPath,
      progress: 0,
      required,
    };
    const msg = `Transmatting to ${targetName}! Hold off those hostiles for ${required} cycles while I crack the Cloud cipher!`;
    const events: KernelEvent[] = [
      {
        type: 'KIRO_ACTION',
        action: 'crack_start',
        core: this.activeCore.shortTag,
        target: targetName,
        message: `CRACKING 0/${required}`,
      },
      {
        type: 'AGENT_TAUNT',
        agent: 'kiro',
        model: 'npc.kiro_ghost',
        text: msg,
        mood: 'order',
      },
    ];
    const stdout =
      `${CYAN}[KIRO.D // ${this.activeCore.shortTag}]${RESET} Shell unfolded at ${GOLD}${targetName}${RESET} [0/${required}]!\n` +
      `  ${GOLD}▸ DEFEND KIRO:${RESET} Survive or execute ${required} actions/ticks in this room while local inference breaks the lock!\n`;
    return { stdout, events };
  }

  /** Advance active decryption by 1 cycle (called on room tick or subsequent player action). */
  advanceCrack(currentDirPath: string): {
    completedTargetPath: string | null;
    completedTargetName: string | null;
    note: string;
    events: KernelEvent[];
  } {
    const job = this.crackJob;
    if (!job) return { completedTargetPath: null, completedTargetName: null, note: '', events: [] };
    if (job.dirPath !== currentDirPath) {
      this.crackJob = null;
      return {
        completedTargetPath: null,
        completedTargetName: null,
        note: `${CYAN}[KIRO.D]${RESET} Left sector—aborted cipher crack on ${job.targetName}, returning to your shoulder.\n`,
        events: [],
      };
    }

    job.progress += 1;
    if (job.progress < job.required) {
      return {
        completedTargetPath: null,
        completedTargetName: null,
        note: `${CYAN}[KIRO.D // ${this.activeCore.shortTag}]${RESET} Decrypting ${GOLD}${job.targetName}${RESET}... [${job.progress}/${job.required}] — keep them off me!\n`,
        events: [
          {
            type: 'KIRO_ACTION',
            action: 'crack_step',
            core: this.activeCore.shortTag,
            target: job.targetName,
            message: `CRACKING ${job.progress}/${job.required}`,
          },
        ],
      };
    }

    this.crackJob = null;
    this.unlockedPaths.add(job.targetPath);
    return {
      completedTargetPath: job.targetPath,
      completedTargetName: job.targetName,
      note: `${CYAN}[KIRO.D // ${this.activeCore.shortTag}]${RESET} ${GREEN}CIPHER CRACKED!${RESET} Unlocked ${GOLD}${job.targetName}${RESET} (${job.required}/${job.required}) — Eyes up, Dev, we’re in!\n`,
      events: [
        {
          type: 'KIRO_ACTION',
          action: 'crack_done',
          core: this.activeCore.shortTag,
          target: job.targetName,
          message: 'CIPHER CRACKED!',
        },
        {
          type: 'AGENT_TAUNT',
          agent: 'kiro',
          model: 'npc.kiro_ghost',
          text: `Cloud cipher shattered! ${job.targetName} is wide open—nice cover fire, Dev!`,
          mood: 'smug',
        },
      ],
    };
  }
}
