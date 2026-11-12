import type { KernelEvent } from '../contracts/events.js';
import { maxHpFor } from '../game/bestiary.js';
import { KIRO_CORE_ORDER, inspectTextWithKiro } from '../game/kiro.js';
import type { Step } from '../game/shell.js';
import { kiroEnemyRow, kiroFileRow, psXrayToggle } from '../game/puzzle.js';
import { absPath, lookup, modeString, resolve, type VNode } from '../game/tree.js';
import { emptyStep, okStep, type ChapterState } from './session-state.js';
import { coreMatches, coreReaction, fillTemplate, hiddenEnemyId, isNodeHidden, kiroIsWeak, levelScript } from './script.js';
import { refreshExitGates } from './session-rules.js';

function chapterLocked(child: VNode): boolean {
  const dirLocked = child.kind === 'dir' && (child.mode & 0o111) === 0;
  const fileLocked = child.kind === 'file' && (child.mode & 0o400) === 0;
  return dirLocked || fileLocked;
}

export function stepKiroCrack(g: ChapterState, events: KernelEvent[]): string {
    const adv = g.kiro.advanceCrack(absPath(g.rt.cwd));
    events.push(...adv.events);
    if (adv.completedTargetPath) {
      const node = lookup(g.rt.root, adv.completedTargetPath);
      if (node && ((node.kind === 'dir' && (node.mode & 0o111) === 0) || (node.kind === 'file' && (node.mode & 0o400) === 0))) {
        const old = node.mode;
        node.mode = node.kind === 'dir' ? 0o755 : 0o644;
        events.push({ type: 'INODE_MODE_CHANGED', inodeId: node.id, oldMode: old, newMode: node.mode });
        events.push({
          type: 'PUZZLE_DOOR_RESOLVED',
          socketInodeId: node.id,
          unlockedInodeId: node.id,
          solvedViaInput: 'kiro_crack',
        });
      }
      refreshExitGates(g, events);
    }
    return adv.note;
  }

function kiroLoad(g: ChapterState, args: string[]): Step {
      const want = args[1];
      if (!want) {
        return emptyStep(1, `kiro load: specify a local .gguf core (${KIRO_CORE_ORDER.join(', ')})\n`);
      }
      const script = levelScript(g).kiro;
      if (script?.loadRefusal) return emptyStep(1, script.loadRefusal);
      const kiroRule = g.rt.spec.winRules.find((r) => r.kind === 'kiro_loaded');
      const wanted = kiroRule && kiroRule.kind === 'kiro_loaded' ? kiroRule.core : '';
      const wrongCore = (): string => fillTemplate(script?.wrongCoreLine ?? '', { core: wanted });
      if (script?.wrongCoreLine && wanted && !coreMatches(g, want, wanted)) return emptyStep(1, wrongCore());
      const res = g.kiro.loadCore(want);
      if (!res.ok) return emptyStep(1, res.stderr ?? res.stdout);
      g.rt.loadedCores.add(g.kiro.activeCore.id);
      g.rt.loadedCores.add(g.kiro.activeCore.gguf);
      const events: KernelEvent[] = [
        { type: 'VIBECODER_ACTION', action: 'cast', command: `kiro load ${want}` },
        ...res.events,
      ];
      refreshExitGates(g, events);
      let banner = '';
      if (script && wanted) {
        const active = `${g.kiro.activeCore.id} ${g.kiro.activeCore.gguf}`;
        const reaction = coreReaction(g, wanted);
        if (script.wrongCoreLine && !coreMatches(g, active, wanted)) {
          banner = wrongCore();
        } else if (reaction) {
          events.push({ type: 'AGENT_TAUNT', agent: reaction.foe.agent, model: reaction.foe.model, text: reaction.foe.text, mood: 'annoyed' });
          events.push({ type: 'AGENT_TAUNT', agent: 'kiro', model: 'npc.kiro_ghost', text: reaction.kiro, mood: 'order' });
          banner = fillTemplate(reaction.banner, { foe: reaction.foe.text, kiro: reaction.kiro, gguf: g.kiro.activeCore.gguf });
        }
      }
      return okStep(res.stdout + banner, events);
}

function kiroScan(g: ChapterState): Step {
      const cwd = absPath(g.rt.cwd);
      const files = Array.from(g.rt.cwd.children.values())
        .filter((child) => !isNodeHidden(g, child))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((child) => kiroFileRow(child, chapterLocked(child), child.kind === 'file' && (child.mode & 0o400) !== 0));
      const hiddenId = hiddenEnemyId(g);
      const enemies = g.rt.world
        .views(cwd)
        .filter((v) => v.kind !== 'pickup' && !(hiddenId && v.id === hiddenId))
        .map(kiroEnemyRow);
      const res = g.kiro.scanRoom({ cwd, ramGb: g.ram, files, enemies });
      const events: KernelEvent[] = [{ type: 'VIBECODER_ACTION', action: 'lantern', command: 'kiro scan' }];
      if (res.enableXray) {
        g.rt.xray = true;
        g.rt.world.revealProcesses(events);
        events.push(psXrayToggle(g.rt.world.procs()));
      }
      if (res.healAmount > 0 && g.hp < maxHpFor(g.ram)) {
        g.hp = Math.min(maxHpFor(g.ram), g.hp + res.healAmount);
      }
      if (res.revealHidden) {
        g.rt.lantern = true;
        const revealed = g.rt.world.reveal(g.rt.cwd, events);
        events.push({ type: 'LANTERN_REVEAL', dirId: g.rt.cwd.id, revealedInodes: revealed });
      }
      events.push(...res.events);
      return okStep(res.stdout, events);
}

export function cmdKiro(g: ChapterState, args: string[], stdin: string): Step {
    const sub = (args[0] ?? '').toLowerCase();
    if (!sub && stdin) {
      return okStep(inspectTextWithKiro(stdin, 'stdin', g.kiro.activeCore), [
        { type: 'VIBECODER_ACTION', action: 'read', command: 'kiro' },
      ]);
    }
    if (!sub || sub === 'status' || sub === 'cores' || sub === 'list') {
      const weakNote = kiroIsWeak(g) ? (levelScript(g).kiro?.weakNote ?? '') : '';
      return okStep(weakNote + g.kiro.formatStatus(g.ram), [
        { type: 'VIBECODER_ACTION', action: 'read', command: 'kiro' },
      ]);
    }
    if (sub === 'load' || sub === 'pull' || sub === 'use' || sub === 'swap') return kiroLoad(g, args);
    if (sub === 'scan' || sub === 'sweep') return kiroScan(g);
    if (sub === 'crack' || sub === 'decrypt' || sub === 'hack') {
      const targetArg = args[1];
      if (!targetArg) return emptyStep(1, 'kiro crack: specify a locked gate or encrypted file\n');
      const found = resolve(g.rt.cwd, targetArg, false);
      if (!found.node) return emptyStep(1, `kiro crack: ${targetArg}: No such file or directory\n`);
      const node = found.node;
      const fullPath = absPath(node);
      if (g.kiro.isUnlocked(fullPath)) {
        return okStep(`[KIRO.D] ${node.name} is already decrypted.\n`);
      }
      const isLocked =
        (node.kind === 'dir' && (node.mode & 0o111) === 0) ||
        (node.kind === 'file' && (node.mode & 0o400) === 0);
      if (!isLocked) {
        return okStep(`[KIRO.D] ${node.name} is already unlocked (${modeString(node)}).\n`);
      }
      const started = g.kiro.startCrack(absPath(g.rt.cwd), node.name, fullPath);
      return okStep(started.stdout, [
        { type: 'VIBECODER_ACTION', action: 'cast', command: `kiro crack ${node.name}` },
        ...started.events,
      ]);
    }
    if (sub === 'inspect' || sub === 'audit') {
      const targetArg = args[1];
      if (!targetArg) return emptyStep(1, 'kiro inspect: specify a file (or pipe via `cat <file> | kiro`)\n');
      const found = resolve(g.rt.cwd, targetArg, true);
      if (!found.node) return emptyStep(1, `kiro inspect: ${targetArg}: No such file\n`);
      if (found.node.kind !== 'file') return emptyStep(1, `kiro inspect: ${targetArg}: Not a regular file\n`);
      if ((found.node.mode & 0o400) === 0) return emptyStep(1, `kiro inspect: ${targetArg}: Permission denied\n`);
      return okStep(inspectTextWithKiro(found.node.content, found.node.name, g.kiro.activeCore), [
        { type: 'VIBECODER_ACTION', action: 'read', command: `kiro inspect ${found.node.name}` },
      ]);
    }
    return emptyStep(1, `kiro: unknown subcommand '${sub}'. Try: kiro | kiro scan | kiro load <core> | kiro crack <lock>\n`);
  }
