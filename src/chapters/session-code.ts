import type { KernelEvent } from '../contracts/events.js';
import { SOURCE_MALWARE_DAMAGE } from '../game/bestiary.js';
import {
  SED_EMPTY_PATTERN,
  compileSedScript,
  emptySedPattern,
  parseSedArgs,
} from '../game/unix-applets.js';
import type { Step } from '../game/shell.js';
import { absPath, hasWrite, resolve, type VNode } from '../game/tree.js';
import type { CommandResult } from '../game/types.js';
import {
  evaluateBatchEvents,
  evaluateLevelClearAchievements,
  evaluateRunEndAchievements,
  formatAchievementLines,
} from './achievements.js';
import { recordLevelClear, recordTelemetry } from './catalog.js';
import { createVfsDockerIo, runDockerCli } from '../game/docker.js';
import { createVfsVimIo, runVimCli } from '../game/vim.js';
import { isNodeHidden, runSteps, syncScriptTriggers } from './script.js';
import { validateDockerfile } from './validators.js';
import { computeLevelRank, computeRunRank, emptyStep, okStep, splitParentAndName, type ChapterState, type EditorOpenPayload } from './session-state.js';
import { syncClearedBattle } from './session-battle.js';
import { cmdCat, collectPickupNode } from './session-fs.js';
import { hurt } from './session-level.js';
import { allWinRulesMet, liveLintFeedback, refreshExitGates, syncValidatedCodeBugs, unfinishedObjectives } from './session-rules.js';
import { snapshot } from './session-snapshot.js';

function commitEdited(g: ChapterState, events: KernelEvent[], inodeId: number, command: string): void {
  events.push({
    type: 'VIBECODER_ACTION',
    action: 'write',
    command,
    targetEntityId: g.rt.world.entityOf(inodeId),
  });
  syncValidatedCodeBugs(g);
  g.rt.world.cause = 'other';
  g.rt.world.sync(events);
  syncClearedBattle(g, events);
  refreshExitGates(g, events);
}

export function readEditableFile(g: ChapterState, nameOrPath: string): ({ ok: true } & EditorOpenPayload) | { ok: false; error: string } {
    const res = resolve(g.rt.cwd, nameOrPath, true);
    if (!res.node || isNodeHidden(g, res.node)) return { ok: false, error: `${nameOrPath}: ${res.error ?? 'No such file or directory'}` };
    if (res.node.kind !== 'file') return { ok: false, error: `${nameOrPath}: Not a regular file` };
    if ((res.node.mode & 0o400) === 0) return { ok: false, error: `${nameOrPath}: Permission denied` };
    const full = absPath(res.node);
    const patches = g.rt.spec.patches.filter(
      (p) => p.file === res.node!.name || p.file === full,
    );
    return {
      ok: true,
      path: full,
      name: res.node.name,
      content: res.node.content,
      patches,
    };
  }

export function saveEditableFile(g: ChapterState, nameOrPath: string, content: string): CommandResult {
    g.deadNow = false;
    const events: KernelEvent[] = [];
    const res = resolve(g.rt.cwd, nameOrPath, true);
    if (res.node && !isNodeHidden(g, res.node)) {
      if (res.node.kind !== 'file') {
        const msg = `edit: ${nameOrPath}: Not a regular file\n`;
        return { output: msg, stderr: msg, events, snapshot: snapshot(g) };
      }
      if (!hasWrite(res.node)) {
        events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.node.id, command: 'edit' });
        const msg = `edit: ${res.node.name}: Permission denied (file is read-only)\n`;
        return { output: msg, stderr: msg, events, snapshot: snapshot(g) };
      }
    }

    let savedNode = res.node && !isNodeHidden(g, res.node) ? res.node : null;
    const normalized = content.endsWith('\n') ? content : `${content}\n`;
    if (savedNode) {
      savedNode.content = normalized;
    } else {
      const io = createVfsVimIo({
        cwd: () => g.rt.cwd,
        isHidden: (node) => isNodeHidden(g, node),
        onWrite: (_abs, node) => {
          savedNode = node;
          return undefined;
        },
      });
      const wr = io.write(nameOrPath, normalized);
      if (!wr.ok || !savedNode) {
        const msg = `edit: ${wr.ok ? nameOrPath : wr.error}\n`;
        return { output: msg, stderr: msg, events, snapshot: snapshot(g) };
      }
    }

    g.rt.filesRead.add(absPath(savedNode));
    g.commands += 1;
    g.rt.levelCommands += 1;
    if (!g.preview) recordTelemetry({ commands: ['edit'] });
    commitEdited(g, events, savedNode.id, `edit ${savedNode.name}`);

    const diag = liveLintFeedback(g, savedNode);
    const notes = g.rt.world.drain() + g.rt.completionNote + syncScriptTriggers(g, events);
    g.rt.completionNote = '';
    const achEvents = evaluateBatchEvents(events, { preview: g.preview, lab: g.lab !== null });
    if (achEvents.length > 0) events.push(...achEvents);
    const output = `[SAVED] ${savedNode.name} (${savedNode.content.split('\n').length - 1} lines)\n${diag}${notes}${formatAchievementLines(achEvents)}`;
    return { output, events, snapshot: snapshot(g) };
  }

export function cmdSed(g: ChapterState, args: string[], stdin: string): Step {
    const { inPlace, extended, rest } = parseSedArgs(args);
    const expr = rest[0] ?? '';
    if (emptySedPattern(expr)) return emptyStep(1, SED_EMPTY_PATTERN);
    const applyLineByLine = compileSedScript(expr, { extended, escapeBasicQuantifiers: true });
    if (!applyLineByLine) {
      return emptyStep(1, "sed: expected s/old/new/[g] expression (e.g. sed -i 's/0000/3000/' file)\n");
    }

    if (!inPlace) {
      if (rest[1]) {
        const catRes = cmdCat(g, [rest[1]], '');
        if (catRes.code !== 0) return catRes;
        return okStep(applyLineByLine(catRes.stdout), catRes.events);
      }
      return okStep(applyLineByLine(stdin));
    }

    const fileArg = rest[1];
    if (!fileArg) return emptyStep(1, 'sed: -i requires a target file\n');
    const res = resolve(g.rt.cwd, fileArg, true);
    if (!res.node || isNodeHidden(g, res.node)) {
      if (!res.node && res.denied) {
        return okStep('', [{ type: 'PERMISSION_DENIED_RATTLE', targetId: res.denied.id, command: 'sed' }], 1, `sed: ${fileArg}: Permission denied\n`);
      }
      return emptyStep(1, `sed: ${fileArg}: No such file\n`);
    }
    if (res.node.kind !== 'file') return emptyStep(1, `sed: ${fileArg}: No such file\n`);
    if (!hasWrite(res.node)) {
      return okStep('', [{ type: 'PERMISSION_DENIED_RATTLE', targetId: res.node.id, command: 'sed' }], 1, `sed: ${fileArg}: Permission denied\n`);
    }

    const events: KernelEvent[] = [];
    res.node.content = applyLineByLine(res.node.content);
    commitEdited(g, events, res.node.id, 'sed');

    const lint = liveLintFeedback(g, res.node);
    return okStep(lint, events);
  }

export function cmdSource(g: ChapterState, args: string[]): Step {
    if (!args[0]) return emptyStep(1, 'usage: source FILE\n');
    const events: KernelEvent[] = [];
    const res = resolve(g.rt.cwd, args[0], true);
    if (!res.node || res.node.kind !== 'file' || isNodeHidden(g, res.node)) {
      return emptyStep(1, `source: ${args[0]}: No such file\n`);
    }
    if ((res.node.mode & 0o400) === 0) {
      events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.node.id, command: 'source' });
      return okStep('', events, 1, `source: ${res.node.name}: Encrypted or unreadable (mode 000)\n`);
    }

    const enemy = g.rt.world.enemyByInode(res.node.id);
    if (enemy) {
      const rattleDmg = g.kiro.mitigateRattle(SOURCE_MALWARE_DAMAGE);
      const hurtMsg = hurt(g, rattleDmg, enemy.name, events);
      return okStep('', events, 1, `source: ${res.node.name}: IT WAS A TRAP! (-${rattleDmg} HP)\n${hurtMsg}`);
    }

    const pickup = g.rt.world.pickupByInode(res.node.id);
    if (pickup) {
      return collectPickupNode(g, pickup, res.node, 'source', events);
    }

    return okStep(`sourced ${res.node.name}\n`, events);
  }

export function cmdEdit(g: ChapterState, args: string[]): Step {
    if (!args[0]) return emptyStep(1, 'usage: edit <filename>\n');
    const info = readEditableFile(g, args[0]);
    if (!info.ok) return emptyStep(1, `edit: ${info.error}\n`);
    g.pendingEditor = {
      path: info.path,
      name: info.name,
      content: info.content,
      patches: info.patches,
    };
    return okStep(
      `[EDITOR] Opened ${info.name} in Split Code Mini-Editor (Ctrl+S to save, Esc to close).\n` +
        `         (CLI tip: you can also patch directly with sed -i 's/old/new/' ${info.name})\n`,
      [{ type: 'VIBECODER_ACTION', action: 'read', command: `edit ${info.name}` }],
    );
  }

export function cmdVim(g: ChapterState, args: string[]): Step {
    const savedNodes: VNode[] = [];
    const io = createVfsVimIo({
      cwd: () => g.rt.cwd,
      isHidden: (node) => isNodeHidden(g, node),
      onRead: (abs) => {
        g.rt.filesRead.add(abs);
      },
      onWrite: (_abs, node) => {
        savedNodes.push(node);
        return undefined;
      },
    });
    const res = runVimCli(args, io);
    if (res.kind === 'error') return emptyStep(res.code, res.stderr);
    const events: KernelEvent[] = [];
    if (res.kind === 'headless') {
      if (savedNodes.length > 0) {
        if (!g.preview) recordTelemetry({ commands: ['vim'] });
        let lint = '';
        for (const node of savedNodes) {
          commitEdited(g, events, node.id, `vim ${node.name}`);
          lint += liveLintFeedback(g, node);
        }
        return { stdout: `${res.stdout}${lint}`, stderr: res.stderr, code: res.code, events };
      }
      refreshExitGates(g, events);
      events.push({ type: 'VIBECODER_ACTION', action: 'read', command: `vim ${args.join(' ')}`.trim() });
      return { stdout: res.stdout, stderr: res.stderr, code: res.code, events };
    }
    refreshExitGates(g, events);
    g.pendingVim = res.payload;
    events.push({ type: 'VIBECODER_ACTION', action: 'read', command: `vim ${res.payload.path || ''}`.trim() });
    return okStep(`[VIM] Opening ${res.payload.path || '[No Name]'}\n`, events);
  }

export function cmdDocker(g: ChapterState, args: string[]): Step {
    const strictDockerfile =
      g.rt.spec.mechanic === 'docker-image' ||
      g.rt.spec.winRules.some((r) => r.kind === 'docker_image_running');
    const io = createVfsDockerIo({
      cwd: () => g.rt.cwd,
      isHidden: (node) => isNodeHidden(g, node),
      projectName: () => g.rt.spec.id,
      validateDockerfile: strictDockerfile ? validateDockerfile : undefined,
    });
    const outcome = runDockerCli(g.rt.docker, args, io);
    g.rt.builtImages = g.rt.docker.images;
    g.rt.containers = g.rt.docker.containers
      .filter((c) => c.status === 'running')
      .map((c) => ({ id: c.id, name: c.name, image: c.image, ports: c.ports, status: 'Up (healthy)' as const }));
    g.rt.composeHealthyServices = new Set(g.rt.docker.composeHealthyServices);

    const events: KernelEvent[] = [];
    if (outcome.builtImage) {
      if (!g.preview) recordTelemetry({ commands: ['docker build'] });
      events.push({ type: 'VIBECODER_ACTION', action: 'cast', command: `docker build -t ${outcome.builtImage.tag}` });
    } else if (args[0] === 'run' && outcome.code === 0) {
      events.push({ type: 'VIBECODER_ACTION', action: 'cast', command: `docker run ${args.slice(1).join(' ')}` });
      events.push({ type: 'ENTITY_SPAWNED', entityId: 'docker:crate:0', model: 'prop.tar', reason: 'script' });
    } else if (outcome.composeResult?.kind === 'up-healthy') {
      if (!g.preview) recordTelemetry({ commands: ['docker compose'] });
      g.rt.flags.add('compose_healthy');
      events.push({ type: 'VIBECODER_ACTION', action: 'cast', command: 'docker compose up -d' });
      const composeRule = g.rt.spec.winRules.find((r) => r.kind === 'docker_compose_healthy');
      const isFloating = Boolean(composeRule && composeRule.kind === 'docker_compose_healthy' && composeRule.floating);
      if (isFloating) {
        const xs = [-0.35, 0.85, 2.05, 3.25];
        outcome.composeResult.services.forEach((_svc, i) => {
          events.push({
            type: 'ENTITY_SPAWNED',
            entityId: `docker:float:${i}`,
            model: 'prop.file',
            reason: 'script',
            entrance: 'glide',
            fromX: xs[i] ?? (-0.35 + i * 1.15),
            fromY: 0.45,
          });
        });
      } else {
        outcome.composeResult.services.slice(0, 3).forEach((_svc, i) => {
          events.push({ type: 'ENTITY_SPAWNED', entityId: `docker:crate:${i}`, model: 'prop.tar', reason: 'script' });
        });
      }
    } else if (outcome.composeResult?.kind === 'up-oom') {
      g.rt.flags.add('compose_oom_crashed');
      const xs = [-0.35, 0.85, 2.05, 3.25];
      events.push({ type: 'VIBECODER_ACTION', action: 'cast', command: 'docker compose up -d' });
      events.push({
        type: 'COMPOSE_OOM_CRASH',
        actors: outcome.composeResult.services.map((svc, i) => ({
          entityId: `docker:oom:${i}`,
          model: 'prop.file',
          label: `[${svc}]`,
          x: xs[i] ?? (-0.35 + i * 1.15),
          hoverY: 1.9 + (i % 2) * 0.25,
        })),
      });
    }

    refreshExitGates(g, events);
    return { stdout: outcome.stdout, stderr: outcome.stderr, code: outcome.code, events };
  }

export function cmdExit(g: ChapterState): Step {
    const events: KernelEvent[] = [];
    refreshExitGates(g, events);
    if (!g.rt.spec.exitCommand) {
      const gate = g.rt.spec.exitDir ? splitParentAndName(g.rt.spec.exitDir).name : 'next_gate';
      return emptyStep(1, `exit: Sector exit is physical—step through \`cd ${gate}\` once objectives are met.\n`);
    }
    if (!allWinRulesMet(g)) {
      const bossName = g.pack.manifest.boss.name;
      const remaining = unfinishedObjectives(g);
      return emptyStep(1, `exit: Kernel core still locked by ${bossName}!\n${remaining}\n`);
    }

    g.ended = true;
    g.endedAt = Date.now();
    const timeSec = Math.max(1, Math.floor((g.endedAt - g.startedAt - g.pausedMs) / 1000));
    const levelSec = Math.max(1, Math.floor((g.endedAt - g.rt.levelStartedAt) / 1000));
    const lvlRank = computeLevelRank(g.rt.levelCommands, g.rt.levelDeaths, g.rt.usedSpoilerRung, g.rt.spec.solutionCommands.length);
    const runRank = computeRunRank(g.commands, g.deaths, g.levels);
    const reward = g.preview
      ? { scrapEarned: 0, totalScrap: 0 }
      : recordLevelClear(g.chapterId, g.rt.spec.id, lvlRank, g.rt.levelCommands, levelSec, g.chaosMode);
    const achUnlocked = [
      ...evaluateLevelClearAchievements({
        openingSector: g.levels[0]?.id === g.rt.spec.id,
        mechanic: g.rt.spec.mechanic,
        rank: lvlRank,
        chaos: g.chaosMode,
        preview: g.preview,
        lab: g.lab !== null,
      }),
      ...evaluateRunEndAchievements({
        rank: runRank,
        deaths: g.deaths,
        fullRun: g.fullRun,
        preview: g.preview,
        lab: g.lab !== null,
      }),
    ];
    const exitSfx = g.rt.spec.stage?.sfx?.exit;
    events.push({ type: 'FLOOR_CLEARED', floorId: g.rt.spec.index, speedrunBonus: runRank === 'S', commandsCount: g.commands, ...(exitSfx ? { sfx: exitSfx } : {}) });
    events.push(...achUnlocked);
    events.push({ type: 'GAME_ENDED', rank: runRank, timeSec, commands: g.commands });

    const achNote = formatAchievementLines(achUnlocked);
    const stats = {
      rank: runRank,
      commands: String(g.commands),
      scrap: String(reward.scrapEarned),
      scrapTotal: String(reward.totalScrap),
    };
    const finale = g.pack.manifest.outro?.finale;
    if (finale) return okStep(`${runSteps(g, finale, events, stats)}${achNote}`, events);
    return okStep(
      `\n========================================================\n` +
        `  ISSUE CLEAR | RANK: ${runRank} | COMMANDS: ${g.commands} | REWARD: +${reward.scrapEarned} Silicon Scrap (Total: ${reward.totalScrap})\n` +
        `========================================================\n${achNote}`,
      events,
    );
  }
