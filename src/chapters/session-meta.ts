import type { KernelEvent } from '../contracts/events.js';
import { maxHpFor } from '../game/bestiary.js';
import type { Step } from '../game/shell.js';
import {
  ACHIEVEMENT_SPECS,
  exportSteamAchievementPayload,
  formatAchievementLines,
  freshAchievementStore,
  presentAchievement,
  readAchievements,
} from './achievements.js';
import { GRIMOIRE_ENTRIES, dossierOf, RIG_PERKS, purchaseOrTogglePerk, readMetagame } from './catalog.js';
import { levelScript } from './script.js';
import { emptyStep, okStep, type ChapterState } from './session-state.js';
import { getChecklist, liveLintFeedback, refreshExitGates } from './session-rules.js';
import { isTauriDesktop, syncSteamAchievements } from './steam-bridge.js';

function allyVoice(g: ChapterState): { allyId: string; allySpeaker: string; allySock: string } {
  const allyId = g.pack.manifest.allyNpc.id;
  const allySpeaker = levelScript(g).allySpeaker ?? allyId.toUpperCase();
  const allySock = `${allyId}.sock`;
  g.rt.talkedSockets.add(allySock);
  for (const rule of g.rt.spec.winRules) if (rule.kind === 'talk_ally') g.rt.talkedSockets.add(rule.socket);
  return { allyId, allySpeaker, allySock };
}

function checklistText(items: { done: boolean; description: string }[]): string {
  return items.map((item) => `  [${item.done ? 'x' : ' '}] ${item.description}`).join('\n');
}

function renderAlly(
  g: ChapterState,
  events: KernelEvent[],
  ally: { allyId: string; allySpeaker: string; allySock: string },
  text: string,
  mood: 'cryptic' | 'hinting',
  tokens: string[],
  banner: string,
): void {
  const talkRule = g.rt.spec.winRules.find((r) => r.kind === 'talk_ally');
  const sockNode = g.rt.cwd.children.get(ally.allySock) ?? (talkRule?.kind === 'talk_ally' ? g.rt.cwd.children.get(talkRule.socket) : undefined);
  events.push({
    type: 'OBSTACLE_DIALOGUE_RENDERED',
    payload: {
      obstacleId: `ally:${ally.allyId}`,
      speakerName: ally.allySpeaker,
      portraitSprite: 'socket_guardian',
      mood,
      bubbleStyle: 'COMIX_CLASSIC',
      anchorInodeId: sockNode?.id ?? g.rt.cwd.id,
      pages: [{ text, highlightedUnixTokens: tokens }],
      ansiTerminalBanner: banner,
    },
  });
  refreshExitGates(g, events);
}

export function cmdHankAudit(g: ChapterState): Step {
    const events: KernelEvent[] = [];
    const ally = allyVoice(g);
    const checklistItems = getChecklist(g);
    const doneCount = checklistItems.filter((c) => c.done).length;
    const checklist = checklistText(checklistItems);
    const lintNotes: string[] = [];
    for (const child of g.rt.cwd.children.values()) {
      if (child.kind === 'file') {
        const msg = liveLintFeedback(g, child).trim();
        if (msg) lintNotes.push(`  ${msg}`);
      }
    }
    const summary =
      doneCount === checklistItems.length
        ? 'All sector checks are GREEN, kid. Step through the exit gate!'
        : `Audit complete: ${doneCount}/${checklistItems.length} objectives green. (Hint rung preserved at ${g.rt.hintRung}/3.)`;
    renderAlly(g, events, ally, summary, 'cryptic', ['status', 'ls', 'edit', 'docker', 'kiro'], `[${ally.allySpeaker} // LIVE SECTOR AUDIT]`);
    const lintSection = lintNotes.length > 0 ? `\nLIVE FILE LINT:\n${lintNotes.join('\n')}` : '';
    return okStep(
      `[${ally.allySpeaker} // LIVE AUDIT]: "${summary}"\nSECTOR OBJECTIVES:\n${checklist}${lintSection}\n`,
      events,
    );
  }

export function cmdHank(g: ChapterState, args: string[]): Step {
    if (args[0] && /^(status|check|audit|review)$/i.test(args[0])) {
      return cmdHankAudit(g);
    }
    const events: KernelEvent[] = [];
    const entry = g.rt.dialog;
    const ally = allyVoice(g);
    const rungIndex = Math.min(2, g.rt.hintRung);
    if (rungIndex === 2) g.rt.usedSpoilerRung = true;
    g.rt.hintRung = Math.min(2, g.rt.hintRung + 1);
    const hintLine = entry?.hankRungs[rungIndex] ?? g.rt.spec.summary;
    const checklist = checklistText(getChecklist(g));
    renderAlly(
      g,
      events,
      ally,
      hintLine,
      'hinting',
      ['ls', 'chmod', 'sed', 'edit', 'docker', 'kill', 'kiro'],
      `[${ally.allySpeaker} // SERIAL MENTOR]`,
    );
    return okStep(
      `[${ally.allySpeaker} // RUNG ${rungIndex + 1}/3]: "${hintLine}"\nSECTOR OBJECTIVES:\n${checklist}\n`,
      events,
    );
  }

/** ` | BATTLE: YOUR TURN (27s)` while a battle runs, else nothing. */
function battleStatus(g: ChapterState): string {
  const b = g.battle;
  if (b.phase === 'idle') return '';
  const who = b.phase === 'player' ? `YOUR TURN (${b.secondsLeft}s)` : b.phase === 'enemy' ? 'ENEMY TURN' : 'STARTING';
  return ` | BATTLE: ${who}`;
}

export function cmdStatus(g: ChapterState): Step {
    const meta = readMetagame();
    const checklist = checklistText(getChecklist(g));
    return okStep(
      `ISSUE: ${g.chapterId} | LEVEL ${g.rt.spec.index}/${g.levels.length}: ${g.rt.spec.title}\n` +
        `HP: ${g.hp}/${maxHpFor(g.ram)} | RAM: ${g.ram}GB | SSD: ${g.ssd}GB | SCRAP: ${meta.scrap}${battleStatus(g)}${g.chaosMode ? ' | CHAOS: ON' : ''}\n` +
        `${checklist}\n`,
    );
  }

export function cmdGrimoire(_g: ChapterState, args: string[]): Step {
    const filter = (args[0] ?? '').toLowerCase();
    const meta = readMetagame();
    const rows = GRIMOIRE_ENTRIES.filter(
      (g) => !filter || g.command.toLowerCase().includes(filter) || g.category.toLowerCase().includes(filter),
    ).map((g) => {
      const seen = meta.usedCommands.includes(g.command.split(' ')[0]!);
      return `  ${seen ? '[*]' : '[ ]'} ${g.command.padEnd(15, ' ')} (${g.category}) :: ${g.syntax}\n      -> ${g.comicEffect}`;
    });
    return okStep(
      `=== DE-VIBED COMMAND GRIMOIRE (${meta.usedCommands.length} practiced) ===\n` +
        `${rows.join('\n') || '  (no matching command)'}\n`,
    );
  }

export function cmdBestiary(g: ChapterState, args: string[]): Step {
    const dossier = dossierOf(g.pack.manifest);
    const filter = (args[0] ?? '').toLowerCase();
    const meta = readMetagame();
    const rows = dossier.filter(
      (b) => !filter || b.id.includes(filter) || b.name.toLowerCase().includes(filter),
    ).map((b) => {
      const seen = meta.seenMalware.includes(b.id);
      return `  ${seen ? '[SEEN]' : '[????]'} ${b.name} [${b.model}]\n         Host: ${b.hostHardware}\n         Counter: ${b.counterplay}`;
    });
    return okStep(
      `=== HARDWARE SPIRIT & MALWARE DOSSIER (${meta.seenMalware.length}/${dossier.length} logged) ===\n` +
        `  [PARODY NOTICE] Anti-Gravy, Codec, Gork & Clod are fictional parodies (0 real AI brands; run \`kiro disclaimer\`).\n` +
        `${rows.join('\n') || '  (no matching entry)'}\n`,
    );
  }

export function cmdWorkshop(g: ChapterState, args: string[]): Step {
    const sub = args[0] ?? '';
    const targetId = sub === 'buy' || sub === 'toggle' ? (args[1] ?? '') : sub;
    if (targetId) {
      if (g.preview || g.lab !== null) {
        return emptyStep(1, '[WORKSHOP] Persistent ~/.bashrc upgrades are disabled in preview/lab sessions.\n');
      }
      const res = purchaseOrTogglePerk(targetId);
      // Apply live if purchased/enabled while inside Level 1 (/home/dev)
      if (res.ok && g.rt.spec.mechanic === 'hub') {
        if (res.action === 'purchased' || res.action === 'enabled') {
          if (targetId.includes('dimm')) {
            g.ram += 16;
            g.hp = maxHpFor(g.ram);
          } else if (targetId.includes('nvme') || targetId.includes('snapshot')) {
            g.ssd += 256;
          }
        }
      }
      const achEvents = res.unlockedAchievements ?? [];
      const achNote = formatAchievementLines(achEvents);
      return res.ok
        ? okStep(`[WORKSHOP] ${res.message}\n${achNote}`, [...achEvents])
        : emptyStep(1, `[WORKSHOP] ${res.message}\n`);
    }

    const meta = readMetagame();
    const lines = RIG_PERKS.map((p) => {
      const owned = meta.unlockedPerks.includes(p.id);
      const active = meta.activePerks.includes(p.id);
      const status = !owned ? `${p.costScrap} Scrap` : active ? 'ACTIVE' : 'OWNED (OFF)';
      return `  - ${p.id.padEnd(22, ' ')} [${status.padEnd(11, ' ')}] ${p.bashrcLine}\n      ${p.effectSummary}`;
    });
    return okStep(
      `=== ~/.bashrc RIG WORKSHOP (Silicon Scrap: ${meta.scrap}) ===\n` +
        `${lines.join('\n')}\n` +
        `Usage: \`workshop <perk-id>\` to unlock or toggle.\n`,
    );
  }

export function cmdAchievements(g: ChapterState, args: string[]): Step {
  const sub = (args[0] ?? '').toLowerCase();
  const isolated = g.preview || g.lab !== null;
  if (sub === 'export' || sub === 'json' || sub === 'sync') {
    const payload = exportSteamAchievementPayload(isolated ? freshAchievementStore() : undefined);
    if (sub === 'sync' && !isolated) {
      void syncSteamAchievements(payload.steamApiNames);
    }
    const modeNote =
      sub === 'sync'
        ? isTauriDesktop()
          ? `[STEAMWORKS BRIDGE] Dispatched ${payload.steamApiNames.length} ACH_* key(s) to Tauri desktop runtime.\n`
          : `[LOCAL -> STEAM READY] ${payload.steamApiNames.length}/${payload.totalCount} ACH_* key(s) queued locally (launch Tauri Steam build to push to SteamUserStats).\n`
        : '';
    return okStep(`${modeNote}${JSON.stringify(payload, null, 2)}\n`);
  }

  const store = isolated ? freshAchievementStore() : readAchievements();
  const unlockedCount = Object.keys(store.unlocked).length;
  const rows = ACHIEVEMENT_SPECS.filter(
    (a) =>
      !sub ||
      a.category.toLowerCase().includes(sub) ||
      a.id.includes(sub) ||
      a.steamApiName.toLowerCase().includes(sub) ||
      (!a.secret || Boolean(store.unlocked[a.id])) && a.title.toLowerCase().includes(sub),
  ).map((a) => {
    const view = presentAchievement(a, store);
    const stamp = view.unlocked ? '[* UNLOCKED]' : '[  LOCKED  ]';
    return `  ${stamp} ${view.title.padEnd(28, ' ')} [${view.category}] (${view.steamApiName})\n                ${view.description}`;
  });

  return okStep(
    `=== LOCAL ACHIEVEMENTS (${unlockedCount}/${ACHIEVEMENT_SPECS.length} UNLOCKED · 1:1 STEAMWORKS READY) ===\n` +
      `${rows.join('\n') || '  (no matching achievement)'}\n` +
      `Tip: run \`achievements export\` for Steamworks JSON or \`achievements sync\` in the desktop build.\n`,
  );
}
