import type { KernelEvent } from '../contracts/events.js';
import { isItemId } from '../contracts/inventory.js';
import { PICKUP_INFO, maxHpFor } from '../game/bestiary.js';
import type { Pickup } from '../game/entities.js';
import { addVram, giveItem, holdItem, markTaken, takeItem } from '../game/inventory.js';
import type { Step } from '../game/shell.js';
import { absPath, hasExec, hasWrite, isDescendantOrSelf, lookup, makeNode, modeString, resolve, walk, type VNode } from '../game/tree.js';
import {
  applyChmodMode,
  applyCutText,
  formatWc,
  parseCutArgs,
  parseGrepArgs,
  parseHeadTailArgs,
  runGrepSources,
  sliceHeadTail,
} from '../game/unix-applets.js';
import { evaluateLevelClearAchievements, formatAchievementLines } from './achievements.js';
import { recordLevelClear } from './catalog.js';
import { computeLevelRank, creatableParent, emptyStep, ensureDirChain, globToRegExp, okStep, splitParentAndName, type ChapterState } from './session-state.js';
import { writeRedirect } from './session-redirect.js';
import { finishTutorial, firstPickupScript, isNodeHidden } from './script.js';
import { levelBannerText, loadLevel } from './session-level.js';
import { cmdHank } from './session-meta.js';
import { allWinRulesMet, refreshExitGates, sinkIntoNull, unfinishedObjectives } from './session-rules.js';
import { riddleRead } from './session-riddle.js';
import { cmdGrepRecursive } from './session-search.js';

/** One `ls -l` row: mode, owner, size, name and a kind suffix (`/` dir, `=` socket, `-> target` symlink). */
function longRow(c: VNode): string {
  const owner = c.uid === 0 ? 'root' : 'dev ';
  const suffix = c.kind === 'dir' ? '/' : c.kind === 'socket' ? '=' : c.kind === 'symlink' && c.link ? ` -> ${c.link}` : '';
  return `${modeString(c)} ${owner} ${String(c.content.length).padStart(5, ' ')} ${c.name}${suffix}`;
}

export function cmdLs(g: ChapterState, args: string[]): Step {
    const events: KernelEvent[] = [];
    let showAll = false;
    let longFmt = false;
    const paths: string[] = [];
    for (const a of args) {
      if (a.startsWith('-') && a.length > 1) {
        if (a.includes('a') || a.includes('A')) showAll = true;
        if (a.includes('l')) longFmt = true;
      } else {
        paths.push(a);
      }
    }
    const targetPath = paths[0] ?? '.';
    const res = resolve(g.rt.cwd, targetPath, true);
    if (!res.node || isNodeHidden(g, res.node)) {
      if (!res.node && res.denied) events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.denied.id, command: 'ls' });
      return okStep('', events, 1, `ls: cannot access '${targetPath}': ${res.error ?? 'No such file or directory'}\n`);
    }
    if (res.node.kind !== 'dir') {
      return okStep(`${longFmt ? longRow(res.node) : res.node.name}\n`);
    }
    if ((res.node.mode & 0o400) === 0) {
      events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.node.id, command: 'ls' });
      return okStep('', events, 1, `ls: cannot open directory '${targetPath}': Permission denied\n`);
    }

    if (showAll) {
      if (res.node === g.rt.cwd) {
        g.rt.lantern = true;
        g.rt.roomSwept = true;
      }
      g.inventory = holdItem(g.inventory, 'tube_transistor');
      const revealed = g.rt.world.reveal(res.node, events);
      for (const child of res.node.children.values()) {
        if (!isNodeHidden(g, child) && child.name.startsWith('.') && !revealed.includes(child.id)) revealed.push(child.id);
      }
      events.push({ type: 'LANTERN_REVEAL', dirId: res.node.id, revealedInodes: revealed });
      events.push({ type: 'VIBECODER_ACTION', action: 'lantern', command: 'ls -a' });
    } else {
      events.push({ type: 'VIBECODER_ACTION', action: 'read', command: 'ls' });
    }
    if (res.node === g.rt.cwd) {
      g.rt.commandsRun.add('ls');
    }

    const entries = Array.from(res.node.children.values())
      .filter((c) => !isNodeHidden(g, c) && (showAll || !c.name.startsWith('.')))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (longFmt) {
      const lines = entries.map(longRow);
      return okStep(lines.length ? `${lines.join('\n')}\n` : '', events);
    }

    const names = entries.map((c) => (c.kind === 'dir' ? `${c.name}/` : c.name));
    return okStep(names.length ? `${names.join('  ')}\n` : '', events);
  }

export function cmdCd(g: ChapterState, args: string[]): Step {
    const events: KernelEvent[] = [];
    const target = args[0] ?? '~';
    if (g.rt.spec.mechanic !== 'hub' && (target === '~' || target === '/home/dev' || target.startsWith('/home/dev/'))) {
      return emptyStep(1, 'bash: cd: /home/dev: SSH connection locked until sector deployment completes\n');
    }

    const res = resolve(g.rt.cwd, target, true);
    if (!res.node) {
      if (res.denied) events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.denied.id, command: 'cd' });
      return okStep('', events, 1, `bash: cd: ${target}: ${res.error}\n`);
    }
    if (res.node.kind !== 'dir') {
      return emptyStep(1, `bash: cd: ${target}: Not a directory\n`);
    }

    const destPath = absPath(res.node);
    const levelRoot = g.rt.spec.cwd;

    // Enforce mission chroot boundary so `cd ..` or `cd /srv` never escapes into undressed parent directories!
    if (destPath !== levelRoot && !destPath.startsWith(`${levelRoot}/`)) {
      return emptyStep(1, `bash: cd: ${target}: chroot jail active at ${levelRoot} (clear sector exit gate to advance)\n`);
    }

    // If stepping into the level's exitDir, check winRules and transition to the next level!
    if (g.rt.spec.exitDir && destPath === g.rt.spec.exitDir) {
      refreshExitGates(g, events);
      if (!allWinRulesMet(g)) {
        events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.node.id, command: 'cd' });
        return okStep('', events, 1, `bash: cd: ${res.node.name}: Sector gate locked! Remaining objectives:\n${unfinishedObjectives(g)}\n`);
      }

      const clearedIndex = g.rt.spec.index;
      const clearedId = g.rt.spec.id;
      const clearedMechanic = g.rt.spec.mechanic;
      const levelSec = Math.max(1, Math.floor((Date.now() - g.rt.levelStartedAt) / 1000));
      const lvlRank = computeLevelRank(g.rt.levelCommands, g.rt.levelDeaths, g.rt.usedSpoilerRung);
      const reward = g.preview
        ? { scrapEarned: 0, totalScrap: 0 }
        : recordLevelClear(g.chapterId, clearedId, lvlRank, g.rt.levelCommands, levelSec, g.chaosMode);
      const achUnlocked = evaluateLevelClearAchievements({
        openingSector: g.levels[0]?.id === clearedId,
        mechanic: clearedMechanic,
        rank: lvlRank,
        chaos: g.chaosMode,
        preview: g.preview,
        lab: g.lab !== null,
      });
      if (!g.rt.tutorialSkipped) finishTutorial(g, events);
      events.push({ type: 'FLOOR_CLEARED', floorId: clearedIndex, speedrunBonus: lvlRank === 'S', commandsCount: g.rt.levelCommands });
      events.push(...achUnlocked);

      if (g.levelIdx + 1 < g.levels.length) {
        loadLevel(g, g.levelIdx + 1, false, events);
        return okStep(
          `[SECTOR ${String(clearedIndex).padStart(2, '0')} CLEAR — RANK ${lvlRank} | +${reward.scrapEarned} Silicon Scrap (Total: ${reward.totalScrap})]${formatAchievementLines(achUnlocked)}\n` +
            levelBannerText(g),
          events,
        );
      }
    }

    if ((res.node.mode & 0o111) === 0) {
      events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.node.id, command: 'cd' });
      return okStep('', events, 1, `bash: cd: ${target}: Permission denied\n`);
    }

    const fromId = g.rt.cwd.id;
    g.rt.cwd = res.node;
    events.push({ type: 'ROOM_TRANSITION', fromDir: fromId, toDir: res.node.id, toPath: destPath, upwardPanelsSmashed: 0, viaSymlinkLoop: false });
    return okStep('', events);
  }

export function cmdCat(g: ChapterState, args: string[], stdin: string): Step {
    if (args.length === 0) return okStep(stdin);
    const events: KernelEvent[] = [];
    let outText = '';
    const bossRule = g.rt.spec.winRules.find((r) => r.kind === 'boss_defeated');

    for (const arg of args) {
      const res = resolve(g.rt.cwd, arg, true);
      if (!res.node || isNodeHidden(g, res.node)) {
        if (res.denied) {
          events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.denied.id, command: 'cat' });
          return okStep('', events, 1, `cat: ${arg}: Permission denied\n`);
        }
        return emptyStep(1, `cat: ${arg}: ${res.error ?? 'No such file or directory'}\n`);
      }
      if (res.node.kind === 'socket') {
        const riddle = riddleRead(g, res.node);
        if (riddle) return riddle;
        g.rt.talkedSockets.add(res.node.name);
        if (bossRule && bossRule.kind === 'boss_defeated' && res.node.name === bossRule.verifySocket) {
          return okStep(`[${res.node.name}] Awaiting ${bossRule.expectedToken} token via \`>\` redirect...\n`, events);
        }
        if (res.node.name.includes('hank') || res.node.name.endsWith('.sock')) {
          return cmdHank(g, []);
        }
      }
      if (res.node.kind === 'dir') {
        return emptyStep(1, `cat: ${arg}: Is a directory\n`);
      }
      if ((res.node.mode & 0o400) === 0) {
        events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.node.id, command: 'cat' });
        return okStep('', events, 1, `cat: ${arg}: Permission denied\n`);
      }
      const full = absPath(res.node);
      g.rt.filesRead.add(full);
      events.push({ type: 'VIBECODER_ACTION', action: 'read', command: 'cat', targetEntityId: g.rt.world.entityOf(res.node.id) });
      outText += res.node.content;
    }
    refreshExitGates(g, events);
    return okStep(outText, events);
  }

function catOrStdin(g: ChapterState, file: string | undefined, stdin: string): Step | string {
  if (!file) return stdin;
  const c = cmdCat(g, [file], '');
  return c.code !== 0 ? c : c.stdout;
}

export function cmdHeadTail(g: ChapterState, cmd: 'head' | 'tail', args: string[], stdin: string): Step {
    const spec = parseHeadTailArgs(args, cmd);
    if ('error' in spec) return emptyStep(1, spec.error);
    const content = catOrStdin(g, spec.files[0], stdin);
    if (typeof content !== 'string') return content;
    return okStep(sliceHeadTail(content, cmd, spec.n));
  }

export function cmdGrep(g: ChapterState, args: string[], stdin: string): Step {
    const spec = parseGrepArgs(args);
    if ('error' in spec) return emptyStep(2, 'usage: grep [-ivcr] PATTERN [FILE...]\n');
    if (spec.recursive) return cmdGrepRecursive(g, spec);

    let haystack = stdin;
    if (spec.files.length > 0) {
      const catRes = cmdCat(g, spec.files, '');
      if (catRes.code !== 0) return catRes;
      haystack = catRes.stdout;
    }

    const { stdout, hits } = runGrepSources([{ name: '', text: haystack }], { ...spec, hide: true, numbers: false, files: [] });
    if (spec.count) return { stdout: `${hits}\n`, stderr: '', code: hits > 0 ? 0 : 1, events: [] };
    if (hits === 0) return emptyStep(1, '');
    return okStep(stdout);
  }

export function cmdWc(g: ChapterState, args: string[], stdin: string): Step {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const files = args.filter((a) => !a.startsWith('-'));
    let text = stdin;
    if (files[0]) {
      const c = cmdCat(g, files, '');
      if (c.code !== 0) return c;
      text = c.stdout;
    }
    return okStep(formatWc(text, flags));
  }

export function cmdCut(g: ChapterState, args: string[], stdin: string): Step {
    const spec = parseCutArgs(args);
    if ('error' in spec) return emptyStep(1, spec.error);
    const text = catOrStdin(g, spec.files[0], stdin);
    if (typeof text !== 'string') return text;
    return okStep(applyCutText(text, spec));
  }

export function cmdFind(g: ChapterState, args: string[]): Step {
    const startPath = args[0] && !args[0].startsWith('-') ? args[0] : '.';
    const nameIdx = args.indexOf('-name');
    const rx = nameIdx >= 0 && args[nameIdx + 1] ? globToRegExp(args[nameIdx + 1]!) : null;
    const res = resolve(g.rt.cwd, startPath, false);
    if (!res.node) return emptyStep(1, `find: '${startPath}': ${res.error}\n`);
    const found: string[] = [];
    walk(res.node, (n) => {
      if (isNodeHidden(g, n)) return;
      if (!rx || rx.test(n.name)) found.push(absPath(n));
    });
    return okStep(found.length ? `${found.join('\n')}\n` : '');
  }

export function cmdTouch(g: ChapterState, args: string[]): Step {
    if (!args[0]) return emptyStep(1, 'usage: touch FILE...\n');
    const events: KernelEvent[] = [];
    for (const a of args) {
      const ex = resolve(g.rt.cwd, a, true);
      if (ex.node) {
        if (isNodeHidden(g, ex.node)) {
          return okStep('', events, 1, `touch: cannot touch '${a}': Permission denied\n`);
        }
        continue;
      }
      const placed = creatableParent(g.rt.root, g.rt.cwd, a);
      if (!placed) {
        const full = a.startsWith('/') ? a : `${absPath(g.rt.cwd)}/${a}`;
        const parent = lookup(g.rt.root, splitParentAndName(full).parentPath);
        const deniedNode = ex.denied ?? (parent && parent.kind === 'dir' && (!hasWrite(parent) || !hasExec(parent)) ? parent : null);
        if (deniedNode) events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: deniedNode.id, command: 'touch' });
        return okStep('', events, 1, `touch: cannot touch '${a}': Permission denied\n`);
      }
      const created = makeNode(placed.parent, placed.name, 'file', 0o644);
      events.push({ type: 'FILE_CREATED', inodeId: created.id, name: created.name });
    }
    return okStep('', events);
  }

export function cmdMkdir(g: ChapterState, args: string[]): Step {
    const targets = args.filter((a) => !a.startsWith('-'));
    if (!targets[0]) return emptyStep(1, 'usage: mkdir DIR...\n');
    for (const t of targets) {
      const full = t.startsWith('/') ? t : `${absPath(g.rt.cwd)}/${t}`;
      ensureDirChain(g.rt.root, full);
    }
    return okStep('');
  }

export function cmdRm(g: ChapterState, args: string[]): Step {
    const events: KernelEvent[] = [];
    let recursive = false;
    let force = false;
    const targets: string[] = [];
    for (const a of args) {
      if (a.startsWith('-')) {
        if (a.includes('r') || a.includes('R')) recursive = true;
        if (a.includes('f')) force = true;
      } else {
        targets.push(a);
      }
    }
    if (targets.length === 0) return emptyStep(1, 'usage: rm [-rf] FILE...\n');

    g.rt.world.cause = 'rm';
    const errors: string[] = [];

    for (const t of targets) {
      const res = resolve(g.rt.cwd, t, false);
      if (!res.node || isNodeHidden(g, res.node)) {
        if (!res.node && res.denied) {
          events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.denied.id, command: 'rm' });
          if (!force) errors.push(`rm: cannot remove '${t}': Permission denied`);
          continue;
        }
        if (!force) errors.push(`rm: cannot remove '${t}': No such file or directory`);
        continue;
      }
      if (res.node === g.rt.root || !res.node.parent || isDescendantOrSelf(g.rt.cwd, res.node)) {
        errors.push(`rm: refusing to remove '${t}'`);
        continue;
      }
      if (res.node.kind === 'dir' && !recursive) {
        errors.push(`rm: cannot remove '${t}': Is a directory`);
        continue;
      }
      if (res.node.kind === 'socket' || res.node.device === 'null') {
        errors.push(`rm: cannot remove '${t}': Operation not permitted`);
        continue;
      }
      if (isItemPickup(g, res.node)) {
        rattleVeto(events, res.node.id, 'rm');
        errors.push(`rm: cannot remove '${t}': pocket your gear with \`mv ${res.node.name} ~\``);
        continue;
      }
      const veto = g.rt.world.vetoRemove(res.node, events);
      if (veto) {
        rattleVeto(events, res.node.id, 'rm');
        errors.push(`rm: ${veto}`);
        continue;
      }
      const entityId = g.rt.world.entityOf(res.node.id);
      res.node.parent?.children.delete(res.node.name);
      events.push({ type: 'FILE_REMOVED', inodeId: res.node.id, name: res.node.name, entityId });
      events.push({ type: 'VIBECODER_ACTION', action: 'cast', command: 'rm', targetEntityId: entityId });
    }

    g.rt.world.sync(events);
    refreshExitGates(g, events);
    if (errors.length > 0) return okStep('', events, 1, `${errors.join('\n')}\n`);
    return okStep('', events);
  }

export function cmdCp(g: ChapterState, args: string[]): Step {
    const clean = args.filter((a) => !a.startsWith('-'));
    if (clean.length < 2) return emptyStep(1, 'usage: cp SRC DEST\n');
    const src = resolve(g.rt.cwd, clean[0]!, true);
    if (!src.node || isNodeHidden(g, src.node)) {
      if (!src.node && src.denied) {
        return okStep('', [{ type: 'PERMISSION_DENIED_RATTLE', targetId: src.denied.id, command: 'cp' }], 1, `cp: cannot stat '${clean[0]}': Permission denied\n`);
      }
      return emptyStep(1, `cp: cannot stat '${clean[0]}'\n`);
    }
    if (src.node.kind !== 'file') return emptyStep(1, `cp: cannot stat '${clean[0]}'\n`);
    if ((src.node.mode & 0o400) === 0) {
      const events: KernelEvent[] = [{ type: 'PERMISSION_DENIED_RATTLE', targetId: src.node.id, command: 'cp' }];
      return okStep('', events, 1, `cp: cannot open '${clean[0]}' for reading: Permission denied\n`);
    }
    return writeRedirect(g, clean[1]!, src.node.content, false, ['cp']);
  }

export function collectPickupNode(g: ChapterState, pickup: Pickup, node: VNode, command: 'source' | 'mv', events: KernelEvent[]): Step {
    if ((node.mode & 0o400) === 0) {
      events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: node.id, command });
      return okStep('', events, 1, `${command}: ${node.name}: Encrypted or unreadable (chmod 644 ${node.name} first)\n`);
    }
    g.rt.world.collect(pickup);
    node.parent?.children.delete(node.name);
    const info = PICKUP_INFO[pickup.type];
    if (pickup.type === 'energy') {
      g.hp = Math.min(maxHpFor(g.ram), g.hp + pickup.amount);
    } else if (pickup.type === 'ram') {
      g.ram += pickup.amount;
      g.hp = Math.min(maxHpFor(g.ram), g.hp + 10);
    } else if (pickup.type === 'ssd') {
      g.ssd += pickup.amount;
    } else if (pickup.type === 'tube_transistor') {
      // The tube transistor: he gets it and holds it; taking it again changes nothing.
      g.inventory = holdItem(giveItem(g.inventory, 'tube_transistor'), 'tube_transistor');
    } else if (pickup.type === 'tensor_gpu') {
      // The Tensor GPU is carried, not held: it joins the inventory and the strip slot lights up.
      g.inventory = takeItem(g.inventory, 'tensor_gpu');
    } else if (pickup.type === 'vram_module') {
      // A VRAM module is consumed into one spare skill charge; the strip slot counts them.
      g.inventory = addVram(g.inventory, 1);
    } else if (pickup.type === 'laptop') {
      // The laptop: he gets it and holds it; taking it again changes nothing.
      g.inventory = holdItem(giveItem(g.inventory, 'laptop'), 'laptop');
    }
    g.inventory = markTaken(g.inventory, g.rt.spec.id, pickup.id);
    const isGpuPart = pickup.type !== 'tensor_gpu' && pickup.type !== 'vram_module' && (/gpu|vram|tensor/i.test(node.name) || /gpu|vram|tensor/i.test(pickup.id));
    const label = isGpuPart ? `${info.label(pickup.amount)} + Local GPU Tensor Chip` : info.label(pickup.amount);
    events.push({
      type: 'PICKUP_COLLECTED',
      entityId: pickup.id,
      item: pickup.type,
      amount: pickup.amount,
      label,
    });
    events.push({ type: 'FILE_REMOVED', inodeId: node.id, name: node.name, entityId: pickup.id });
    events.push({ type: 'VIBECODER_ACTION', action: 'collect', command, targetEntityId: pickup.id });
    refreshExitGates(g, events);
    const firstNote = firstPickupScript(g, pickup.type, events);
    return okStep(`[COLLECTED] ${node.name} (${label})\n${firstNote}`, events);
  }

const HOME_DESTS = new Set(['~', '~/', '$HOME', '/home/dev', '/home/dev/']);

function isItemPickup(g: ChapterState, node: VNode): boolean {
  const pickup = g.rt.world.pickupByInode(node.id);
  return Boolean(pickup && isItemId(pickup.type));
}

function isHomeDest(destRaw: string, fileName: string): boolean {
  return HOME_DESTS.has(destRaw) || destRaw === `/home/dev/${fileName}` || destRaw === `~/${fileName}`;
}

function rattleVeto(events: KernelEvent[], targetId: number, command: string): void {
  if (!events.some((e) => e.type === 'ENEMY_HIT' || e.type === 'ENTITY_SPAWNED')) {
    events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId, command });
  }
}

export function cmdMv(g: ChapterState, args: string[]): Step {
    const clean = args.filter((a) => !a.startsWith('-'));
    if (clean.length < 2) return emptyStep(1, 'usage: mv SRC DEST\n');
    const events: KernelEvent[] = [];
    const src = resolve(g.rt.cwd, clean[0]!, false);
    if (!src.node || isNodeHidden(g, src.node)) {
      if (!src.node && src.denied) {
        return okStep('', [{ type: 'PERMISSION_DENIED_RATTLE', targetId: src.denied.id, command: 'mv' }], 1, `mv: cannot stat '${clean[0]}': Permission denied\n`);
      }
      return emptyStep(1, `mv: cannot stat '${clean[0]}': No such file\n`);
    }

    const destRaw = clean[1]!;
    // Pocketing hardware pickups into `/home/dev` (`mv ram_16gb.dimm ~`), matching Classic mode & Feature 01 SPEC!
    if (isHomeDest(destRaw, src.node.name)) {
      const pickup = g.rt.world.pickupByInode(src.node.id);
      if (pickup) {
        return collectPickupNode(g, pickup, src.node, 'mv', events);
      }
      if (g.rt.spec.mechanic !== 'hub') {
        return emptyStep(1, `mv: '${destRaw}': only hardware pickups (*.cell, *.dimm, *.img) can be pocketed to ~\n`);
      }
    }

    if (isItemPickup(g, src.node)) {
      rattleVeto(events, src.node.id, 'mv');
      return okStep('', events, 1, `mv: '${clean[0]}': pocket your gear into ~ instead (\`mv ${src.node.name} ~\`)\n`);
    }

    if (destRaw === '/dev/null') {
      const veto = g.rt.world.vetoRemove(src.node, events);
      if (veto) {
        rattleVeto(events, src.node.id, 'mv');
        return okStep('', events, 1, `mv: ${veto}\n`);
      }
      if (src.node.name.endsWith('.stream')) g.rt.streamDrained = true;
      src.node.parent?.children.delete(src.node.name);
      g.rt.world.cause = 'devnull';
      sinkIntoNull(g, events, src.node.id);
      return okStep(`[MOVED ${src.node.name} -> /dev/null]\n`, events);
    }

    if (g.rt.world.enemyByInode(src.node.id)) {
      return emptyStep(1, `mv: '${clean[0]}': active malware clings to its sector (rm it or mv it to /dev/null)\n`);
    }

    const dst = resolve(g.rt.cwd, destRaw, true);
    const into = dst.node && dst.node.kind === 'dir' ? dst.node : lookup(g.rt.root, splitParentAndName(destRaw.startsWith('/') ? destRaw : `${absPath(g.rt.cwd)}/${destRaw}`).parentPath);
    if (into && isDescendantOrSelf(into, src.node)) return emptyStep(1, `mv: cannot move '${clean[0]}' into itself\n`);
    const fromDir = src.node.parent?.id ?? g.rt.cwd.id;
    let toDir: number;
    if (dst.node && dst.node.kind === 'dir') {
      src.node.parent?.children.delete(src.node.name);
      src.node.parent = dst.node;
      dst.node.children.set(src.node.name, src.node);
      toDir = dst.node.id;
    } else {
      const { parentPath, name } = splitParentAndName(
        destRaw.startsWith('/') ? destRaw : `${absPath(g.rt.cwd)}/${destRaw}`,
      );
      const parent = lookup(g.rt.root, parentPath);
      if (!parent || parent.kind !== 'dir') return emptyStep(1, `mv: cannot move to '${destRaw}'\n`);
      src.node.parent?.children.delete(src.node.name);
      src.node.parent = parent;
      src.node.name = name;
      parent.children.set(name, src.node);
      toDir = parent.id;
    }
    events.push({ type: 'OBJECT_MOVED', inodeId: src.node.id, fromDir, toDir, formedBridge: false, suckedIntoNull: false });
    g.rt.world.sync(events);
    refreshExitGates(g, events);
    return okStep('', events);
  }

export function cmdChmod(g: ChapterState, args: string[]): Step {
    if (args.length < 2) return emptyStep(1, 'usage: chmod MODE FILE...\n');
    const modeSpec = args[0]!;
    const targets = args.slice(1);
    const events: KernelEvent[] = [];
    g.rt.world.cause = 'chmod';

    for (const t of targets) {
      const res = resolve(g.rt.cwd, t, true);
      if (!res.node || isNodeHidden(g, res.node)) {
        if (!res.node && res.denied) {
          events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.denied.id, command: 'chmod' });
          return okStep('', events, 1, `chmod: cannot access '${t}': Permission denied\n`);
        }
        return okStep('', events, 1, `chmod: cannot access '${t}': No such file or directory\n`);
      }
      const veto = g.rt.world.vetoChmod(res.node);
      if (veto) {
        events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: res.node.id, command: 'chmod' });
        return okStep('', events, 1, `chmod: ${veto}\n`);
      }

      const oldMode = res.node.mode;
      const newMode = applyChmodMode(oldMode, modeSpec);
      if (newMode === null) return emptyStep(1, `chmod: invalid mode: '${modeSpec}'\n`);

      res.node.mode = newMode;
      events.push({ type: 'INODE_MODE_CHANGED', inodeId: res.node.id, oldMode, newMode });
      events.push({ type: 'VIBECODER_ACTION', action: 'cast', command: 'chmod', targetEntityId: g.rt.world.entityOf(res.node.id) });
    }

    g.rt.world.sync(events);
    refreshExitGates(g, events);
    return okStep('', events);
  }
