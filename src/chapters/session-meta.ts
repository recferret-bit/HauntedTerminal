import type { KernelEvent } from '../contracts/events.js';
import { maxHpFor } from '../game/bestiary.js';
import type { Step } from '../game/shell.js';
import { GRIMOIRE_ENTRIES, dossierOf, RIG_PERKS, purchaseOrTogglePerk, readMetagame } from './catalog.js';
import { levelScript } from './script.js';
import { emptyStep, okStep, type ChapterState } from './session-state.js';
import { getChecklist, liveLintFeedback, refreshExitGates } from './session-rules.js';

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
    const entry = g.pack.dialogs?.levels[g.rt.spec.id];
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

export function cmdStatus(g: ChapterState): Step {
    const meta = readMetagame();
    const checklist = checklistText(getChecklist(g));
    return okStep(
      `ISSUE: ${g.chapterId} | LEVEL ${g.rt.spec.index}/${g.levels.length}: ${g.rt.spec.title}\n` +
        `HP: ${g.hp}/${maxHpFor(g.ram)} | RAM: ${g.ram}GB | SSD: ${g.ssd}GB | SCRAP: ${meta.scrap} | TACTICAL: ${g.tacticalMode ? 'ON' : 'OFF'}${g.chaosMode ? ' | CHAOS: ON' : ''}\n` +
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
      return `  ${seen ? '[★]' : '[ ]'} ${g.command.padEnd(15, ' ')} (${g.category}) :: ${g.syntax}\n      -> ${g.comicEffect}`;
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
        `${rows.join('\n') || '  (no matching entry)'}\n`,
    );
  }

export function cmdWorkshop(g: ChapterState, args: string[]): Step {
    const sub = args[0] ?? '';
    const targetId = sub === 'buy' || sub === 'toggle' ? (args[1] ?? '') : sub;
    if (targetId) {
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
      return res.ok ? okStep(`[WORKSHOP] ${res.message}\n`) : emptyStep(1, `[WORKSHOP] ${res.message}\n`);
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
