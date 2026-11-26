import type { KernelEvent } from '../contracts/events.js';
import { maxHpFor } from '../game/bestiary.js';
import { KIRO_CORE_ORDER } from '../game/kiro.js';
import { runKiroCommand, stepKiroCrackOnRoot } from '../game/kiro-commands.js';
import type { Step } from '../game/shell.js';
import { kiroEnemyRow, kiroFileRow, psXrayToggle } from '../game/puzzle.js';
import { absPath, type VNode } from '../game/tree.js';
import { emptyStep, okStep, type ChapterState } from './session-state.js';
import { coreMatches, coreReaction, fillTemplate, hiddenEnemyId, isNodeHidden, kiroIsWeak, levelScript } from './script.js';
import { refreshExitGates } from './session-rules.js';

function chapterLocked(child: VNode): boolean {
  const dirLocked = child.kind === 'dir' && (child.mode & 0o111) === 0;
  const fileLocked = child.kind === 'file' && (child.mode & 0o400) === 0;
  return dirLocked || fileLocked;
}

export function stepKiroCrack(g: ChapterState, events: KernelEvent[]): string {
  const res = stepKiroCrackOnRoot(g.kiro, g.rt.root, absPath(g.rt.cwd), 0o400, (ev) => events.push(ev));
  if (res.completed) refreshExitGates(g, events);
  return res.note;
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
        events.push(psXrayToggle(g.rt.world.procs(), true));
      }
      if (res.healAmount > 0 && g.hp < maxHpFor(g.ram)) {
        g.hp = Math.min(maxHpFor(g.ram), g.hp + res.healAmount);
      }
      if (res.revealHidden) {
        g.rt.lantern = true;
        const revealed = g.rt.world.reveal(g.rt.cwd, events);
        for (const child of g.rt.cwd.children.values()) {
          if (!isNodeHidden(g, child) && child.name.startsWith('.') && !revealed.includes(child.id)) revealed.push(child.id);
        }
        events.push({ type: 'LANTERN_REVEAL', dirId: g.rt.cwd.id, revealedInodes: revealed });
      }
      events.push(...res.events);
      return okStep(res.stdout, events);
}

export function cmdKiro(g: ChapterState, args: string[], stdin: string): Step {
  return runKiroCommand(
    {
      cwd: g.rt.cwd,
      readMask: 0o400,
      ramGb: g.ram,
      weakNote: kiroIsWeak(g) ? (levelScript(g).kiro?.weakNote ?? '') : '',
      checkAlreadyDecrypted: true,
      noFileMessage: 'No such file',
      onAction(action, command, events) {
        events.push({ type: 'VIBECODER_ACTION', action, command });
      },
      onDenied(node, _command, msg) {
        return okStep('', [{ type: 'PERMISSION_DENIED_RATTLE', targetId: node.id, command: 'kiro inspect' }], 1, msg);
      },
      loadCore: (loadArgs) => kiroLoad(g, loadArgs),
      scanRoom: () => kiroScan(g),
    },
    g.kiro,
    args,
    stdin,
  );
}
