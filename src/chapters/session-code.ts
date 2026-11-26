import type { KernelEvent } from '../contracts/events.js';
import { SOURCE_MALWARE_DAMAGE } from '../game/bestiary.js';
import {
  SED_EMPTY_PATTERN,
  compileSedScript,
  emptySedPattern,
  parseSedArgs,
} from '../game/unix-applets.js';
import type { Step } from '../game/shell.js';
import { absPath, hasWrite, resolve } from '../game/tree.js';
import type { CommandResult } from '../game/types.js';
import {
  evaluateBatchEvents,
  evaluateLevelClearAchievements,
  evaluateRunEndAchievements,
  formatAchievementLines,
} from './achievements.js';
import { recordLevelClear, recordTelemetry } from './catalog.js';
import { runSteps } from './script.js';
import { validateDockerCompose, validateDockerfile } from './validators.js';
import { computeLevelRank, computeRunRank, emptyStep, okStep, splitParentAndName, type ChapterState, type EditorOpenPayload } from './session-state.js';
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
  refreshExitGates(g, events);
}

export function readEditableFile(g: ChapterState, nameOrPath: string): ({ ok: true } & EditorOpenPayload) | { ok: false; error: string } {
    const res = resolve(g.rt.cwd, nameOrPath, true);
    if (!res.node) return { ok: false, error: `${nameOrPath}: ${res.error ?? 'No such file or directory'}` };
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
    if (!res.node || res.node.kind !== 'file') {
      const msg = `edit: ${nameOrPath}: ${res.error ?? (res.node ? 'Not a regular file' : 'cannot save file')}\n`;
      return {
        output: msg,
        stderr: msg,
        events,
        snapshot: snapshot(g),
      };
    }
    if (!hasWrite(res.node)) {
      events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.node.id, command: 'edit' });
      const msg = `edit: ${res.node.name}: Permission denied (file is read-only)\n`;
      return { output: msg, stderr: msg, events, snapshot: snapshot(g) };
    }

    res.node.content = content.endsWith('\n') ? content : `${content}\n`;
    g.commands += 1;
    g.rt.levelCommands += 1;
    if (!g.preview) recordTelemetry({ commands: ['edit'] });
    commitEdited(g, events, res.node.id, `edit ${res.node.name}`);

    const diag = liveLintFeedback(g, res.node);
    const notes = g.rt.world.drain() + g.rt.completionNote;
    g.rt.completionNote = '';
    const achEvents = evaluateBatchEvents(events, { preview: g.preview, lab: g.lab !== null });
    if (achEvents.length > 0) events.push(...achEvents);
    const output = `[SAVED] ${res.node.name} (${res.node.content.split('\n').length - 1} lines)\n${diag}${notes}${formatAchievementLines(achEvents)}`;
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
    if (!res.node) {
      if (res.denied) {
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
    if (!res.node || res.node.kind !== 'file') {
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

function dockerCompose(g: ChapterState, args: string[]): Step {
    const events: KernelEvent[] = [];
      const action = args[1] ?? 'ps';
      const composeNode = resolve(g.rt.cwd, 'docker-compose.yml', true).node;
      if (!composeNode) {
        return emptyStep(1, 'docker compose: no docker-compose.yml found in current directory\n');
      }

      if (action === 'config') {
        const v = validateDockerCompose(composeNode.content);
        if (!v.ok) {
          return emptyStep(
            1,
            `docker compose config FAILED:\n${v.errors.map((e) => `  - ${e}`).join('\n')}\n`,
          );
        }
        return okStep('docker compose config: SYNTAX & SERVICE TOPOLOGY OK (nginx + website + payment)\n');
      }

      if (action === 'up') {
        const v = validateDockerCompose(composeNode.content);
        if (!v.ok) {
          return emptyStep(
            1,
            `docker compose up FAILED:\n${v.errors.map((e) => `  [ERROR] ${e}`).join('\n')}\n`,
          );
        }
        if (!g.preview) recordTelemetry({ commands: ['docker compose'] });
        g.rt.composeHealthyServices = new Set(['nginx', 'website', 'payment']);
        events.push({ type: 'VIBECODER_ACTION', action: 'cast', command: 'docker compose up -d' });
        ['nginx', 'website', 'payment'].forEach((_svc, i) => {
          events.push({
            type: 'ENTITY_SPAWNED',
            entityId: `docker:crate:${i}`,
            model: 'prop.tar',
            reason: 'script',
          });
        });
        refreshExitGates(g, events);
        return okStep(
          '[+] Network byterig_default  Created\n' +
            '[+] Container byterig-payment-1  Started (healthy :4002)\n' +
            '[+] Container byterig-website-1  Started (healthy -> http://payment:4002)\n' +
            '[+] Container byterig-nginx-1    Started (healthy 0.0.0.0:8080->80/tcp)\n',
          events,
        );
      }

      if (action === 'ps') {
        if (g.rt.composeHealthyServices.size === 0) {
          return okStep('NAME   IMAGE   STATUS   PORTS\n(no active compose stack)\n');
        }
        return okStep(
          'NAME                IMAGE              STATUS          PORTS\n' +
            'byterig-nginx-1     nginx:alpine       Up (healthy)    0.0.0.0:8080->80/tcp\n' +
            'byterig-website-1   byterig-web:1.0    Up (healthy)    3000/tcp\n' +
            'byterig-payment-1   byterig-pay:1.0    Up (healthy)    4002/tcp\n',
        );
      }

      if (action === 'down') {
        g.rt.composeHealthyServices.clear();
        return okStep('[+] Stopped and removed byterig compose stack.\n');
      }

      if (action === 'logs') {
        return okStep(
          g.rt.composeHealthyServices.size > 0
            ? 'nginx-1    | 200 GET / -> website:3000\nwebsite-1  | Connected to http://payment:4002 (LIVE)\n'
            : 'compose: stack is not running (use `docker compose up -d`)\n',
        );
      }

      return emptyStep(1, 'usage: docker compose [config | up -d | ps | logs | down]\n');
}

function dockerBuild(g: ChapterState, args: string[]): Step {
    const events: KernelEvent[] = [];
      let tag = 'byterig-web:latest';
      const tIdx = args.indexOf('-t');
      if (tIdx >= 0 && args[tIdx + 1]) tag = args[tIdx + 1]!;
      const df = resolve(g.rt.cwd, 'Dockerfile', true).node;
      if (!df) return emptyStep(1, 'ERROR: failed to read Dockerfile: open Dockerfile: no such file\n');

      const v = validateDockerfile(df.content);
      if (!v.ok) {
        return emptyStep(
          1,
          `[+] Building 0.2s (FAILED)\n${v.errors.map((e) => ` => ERROR ${e}`).join('\n')}\n`,
        );
      }

      if (!g.preview) recordTelemetry({ commands: ['docker build'] });
      g.rt.builtImages.set(tag, {
        tag,
        baseImage: v.baseImage,
        exposePort: v.exposePort,
      });
      events.push({ type: 'VIBECODER_ACTION', action: 'cast', command: `docker build -t ${tag}` });
      return okStep(
        `[+] Building 0.8s (5/5) FINISHED\n` +
          ` => [1/4] FROM ${v.baseImage}\n` +
          ` => [2/4] WORKDIR /app\n` +
          ` => [3/4] COPY . .\n` +
          ` => exporting to image ${tag} (EXPOSE ${v.exposePort})\n`,
        events,
      );
}

function dockerRun(g: ChapterState, args: string[]): Step {
    const events: KernelEvent[] = [];
      let portMap = '';
      let image = '';
      for (let i = 1; i < args.length; i++) {
        const a = args[i]!;
        if (a === '-d') continue;
        if (a === '-p' && args[i + 1]) {
          portMap = args[++i]!;
        } else if (a === '--name' && args[i + 1]) {
          i += 1;
        } else if (!a.startsWith('-')) {
          image = a;
        }
      }
      if (!image) return emptyStep(1, 'usage: docker run -d -p 3000:3000 <image:tag>\n');
      const built = g.rt.builtImages.get(image);
      if (!built) {
        return emptyStep(
          1,
          `Unable to find image '${image}' locally. Build it first with: docker build -t ${image} .\n`,
        );
      }
      const containerPort = Number((portMap.split(':').pop() ?? '0').replace(/\/(tcp|udp)$/i, ''));
      if (containerPort !== built.exposePort) {
        return emptyStep(
          1,
          `docker: port mismatch "${portMap || '(none)'}" — image ${image} exposes port ${built.exposePort} (use -p 3000:3000).\n`,
        );
      }

      const cid = `c${100 + g.rt.containers.length}`;
      g.rt.containers.push({
        id: cid,
        name: `byterig_${g.rt.containers.length + 1}`,
        image,
        ports: portMap,
        status: 'Up (healthy)',
      });
      events.push({ type: 'VIBECODER_ACTION', action: 'cast', command: `docker run ${image}` });
      events.push({ type: 'ENTITY_SPAWNED', entityId: 'docker:crate:0', model: 'prop.tar', reason: 'script' });
      refreshExitGates(g, events);
      return okStep(`${cid}9f8a21e0 — container ${image} listening on ${portMap} (healthy)\n`, events);
}

export function cmdDocker(g: ChapterState, args: string[]): Step {
    const sub = args[0] ?? '';
    if (sub === 'compose') return dockerCompose(g, args);
    if (sub === 'build') return dockerBuild(g, args);

    if (sub === 'images') {
      const rows = Array.from(g.rt.builtImages.values()).map(
        (img) => `${img.tag.padEnd(24, ' ')} ${img.baseImage.padEnd(18, ' ')} 142MB`,
      );
      return okStep(`REPOSITORY:TAG           BASE               SIZE\n${rows.join('\n') || '(none)'}\n`);
    }

    if (sub === 'run') return dockerRun(g, args);

    if (sub === 'ps') {
      if (g.rt.containers.length === 0) return okStep('CONTAINER ID   IMAGE   STATUS   PORTS\n');
      const lines = g.rt.containers.map(
        (c) => `${c.id.padEnd(14, ' ')} ${c.image.padEnd(20, ' ')} ${c.status.padEnd(15, ' ')} ${c.ports}`,
      );
      return okStep(`CONTAINER ID   IMAGE                STATUS          PORTS\n${lines.join('\n')}\n`);
    }

    if (sub === 'stop' || sub === 'rm') {
      g.rt.containers = [];
      return okStep('Stopped/removed running containers.\n');
    }

    return emptyStep(
      1,
      'usage: docker [build -t <tag> . | images | run -d -p 3000:3000 <tag> | ps | compose up -d]\n',
    );
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
    const lvlRank = computeLevelRank(g.rt.levelCommands, g.rt.levelDeaths, g.rt.usedSpoilerRung);
    const runRank = computeRunRank(g.commands, g.deaths, g.levels.length);
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
    events.push({ type: 'FLOOR_CLEARED', floorId: g.rt.spec.index, speedrunBonus: runRank === 'S', commandsCount: g.commands });
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
