import { hasItem } from '../game/inventory.js';
import { stripCommandsFromText } from '../game/puzzle.js';
import { lookup } from '../game/tree.js';
import type { HintGoals, HintTask } from '../game/types.js';
import { allWinRulesMet, evalWinRule } from './session-rules.js';
import { splitParentAndName, type ChapterState } from './session-state.js';
import type { WinRule } from './types.js';

function baseName(path: string): string {
  return splitParentAndName(path).name || path;
}

function relTarget(cwd: string, fullPath: string): string {
  const prefix = cwd.endsWith('/') ? cwd : `${cwd}/`;
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : baseName(fullPath);
}

function allyLabel(g: ChapterState): string {
  return g.pack.manifest.allyNpc.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || 'your ally';
}

function fileAbsentLabel(g: ChapterState, path: string): string {
  const name = baseName(path);
  const pickup = g.rt.spec.pickups.find((p) => p.path === path);
  if (pickup?.type === 'tensor_gpu') return `Find and collect the hidden Tensor GPU (${name})`;
  if (/gpu|tensor|shader|h100/i.test(name)) return `Collect GPU chip (${name})`;
  if (pickup?.type === 'ram') return `Collect RAM stick (${name})`;
  if (pickup?.type === 'ssd') return `Collect SSD drive (${name})`;
  if (pickup?.type === 'energy') return `Collect energy cell (${name})`;
  if (pickup?.type === 'tube_transistor') return 'Pick up the Tube Transistor';
  if (pickup?.type === 'laptop') return 'Pick up the laptop';
  if (name.startsWith('.')) return `Find and remove hidden file (${name})`;
  return `Remove ${relTarget(g.rt.spec.cwd, path)}`;
}

function enemyTaskLabel(g: ChapterState, enemyId: string): string {
  const e = g.rt.spec.enemies.find((x) => x.id === enemyId);
  if (!e) return `Neutralize ${enemyId}`;
  const target = relTarget(g.rt.spec.cwd, e.path);
  if (e.buffer) return `Protect ${baseName(e.buffer)} to stop ${target}`;
  if (e.type === 'trojan') return `Disable ${target}`;
  if (e.type === 'worm') return `Purge ${target}`;
  return `Neutralize ${target}`;
}

function bossPhaseTasks(g: ChapterState, rule: Extract<WinRule, { kind: 'boss_defeated' }>): HintTask[] {
  const stream = lookup(g.rt.root, rule.streamPath);
  const drained = !stream || stream.content.trim() === '' || g.rt.streamDrained;
  const sigSent = (g.rt.socketInputs.get(rule.verifySocket) ?? '').includes(rule.expectedToken);
  const anchor = lookup(g.rt.root, rule.anchorPath);
  const unlocked = Boolean(anchor && anchor.content.includes(rule.anchorPattern));
  const boss = g.rt.world.get(rule.bossId);
  const bossSpec = g.rt.spec.enemies.find((e) => e.id === rule.bossId);
  const bossName = bossSpec ? baseName(bossSpec.path) : g.pack.manifest.boss.processName;
  return [
    { label: `Drain ${baseName(rule.streamPath)} into the void`, done: drained },
    { label: `Send the advisor signature to ${rule.verifySocket}`, done: sigSent },
    { label: `Disable the lock in ${baseName(rule.anchorPath)}`, done: unlocked },
    { label: `Terminate ${bossName}`, done: !boss || boss.dead },
  ];
}

function tasksForRule(g: ChapterState, rule: WinRule): HintTask[] {
  if (rule.kind === 'boss_defeated') return bossPhaseTasks(g, rule);
  const done = evalWinRule(g, rule);
  switch (rule.kind) {
    case 'read_file':
      return [{ label: `Read ${baseName(rule.path)}`, done }];
    case 'talk_ally':
      return [{ label: `Talk to ${allyLabel(g)} (${rule.socket})`, done }];
    case 'riddle_solved': {
      const r = g.rt.spec.riddles?.find((x) => x.id === rule.riddleId);
      return [{ label: `Solve the riddle at ${r ? baseName(r.path) : rule.riddleId}`, done }];
    }
    case 'file_absent':
      return [{ label: fileAbsentLabel(g, rule.path), done }];
    case 'file_contains':
      return [{ label: `Update ${baseName(rule.path)} (${rule.pattern})`, done }];
    case 'dir_accessible':
      return [{ label: `Unlock directory ${baseName(rule.path)}`, done }];
    case 'kiro_decrypted':
      return [{ label: `Decrypt ${baseName(rule.path)}`, done }];
    case 'kiro_loaded':
      return [{ label: `Load open-weight model "${rule.core}" into Kiro.d`, done }];
    case 'enemy_neutralized':
      return [{ label: enemyTaskLabel(g, rule.enemyId), done }];
    case 'html_css_valid':
      return [{ label: `Repair layout and controls in ${baseName(rule.htmlPath)} and ${baseName(rule.cssPath)}`, done }];
    case 'cart_js_valid':
      return [{ label: `Fix the calculation bug in ${baseName(rule.jsPath)}`, done }];
    case 'docker_image_running':
      return [{ label: `Fix Dockerfile and run ${rule.imageTag} on port ${rule.port}`, done }];
    case 'docker_compose_healthy':
      return [{ label: `Fix docker-compose.yml and start services (${rule.services.join(', ')})`, done }];
  }
}

function labTasks(g: ChapterState): HintTask[] {
  if (!g.lab) return [];
  const out: HintTask[] = [];
  for (const c of g.lab.content.checks) {
    out.push({ label: stripCommandsFromText(c.description), done: g.rt.lab.hits.has(c.id) });
  }
  for (const r of g.lab.content.riddles) {
    out.push({ label: `Solve ${baseName(r.path)}`, done: g.rt.lab.solved.has(r.id) });
  }
  return out;
}

/**
 * Minimal, command-free tasks and goals for the current chapter level.
 * Derived declaratively from `LevelSpec` and live runtime state so no exact shell commands leak into `? Hint`.
 */
export function chapterHintGoals(g: ChapterState): HintGoals {
  const spec = g.rt.spec;
  const tasks: HintTask[] = [];
  const ruleAbsentPaths = new Set(spec.winRules.filter((r) => r.kind === 'file_absent').map((r) => r.path));
  const transistorPickup = spec.pickups.find((p) => p.type === 'tube_transistor' && !ruleAbsentPaths.has(p.path));
  if (transistorPickup) {
    tasks.push({ label: 'Pick up the Tube Transistor to light the room', done: hasItem(g.inventory, 'tube_transistor') });
  }
  const laptopPickup = spec.pickups.find((p) => p.type === 'laptop' && !ruleAbsentPaths.has(p.path));
  if (laptopPickup) {
    tasks.push({ label: 'Pick up the laptop for coding tasks', done: hasItem(g.inventory, 'laptop') });
  }
  for (const rule of spec.winRules) tasks.push(...tasksForRule(g, rule));
  const lab = labTasks(g);
  tasks.push(...lab);

  const hasRules = spec.winRules.length > 0;
  const labMet = lab.length === 0 || lab.every((t) => t.done);
  const exitReady = hasRules ? allWinRulesMet(g) && labMet : lab.length > 0 && labMet;
  const exitName = spec.exitDir ? baseName(spec.exitDir) : '';
  if (exitName) {
    tasks.push({ label: `Advance through ${exitName}`, done: false, kind: 'exit' });
  } else if (spec.exitCommand) {
    tasks.push({ label: 'Leave the system once the core is clear', done: false, kind: 'exit' });
  }

  const goal = exitReady
    ? exitName
      ? `All tasks done — ${exitName} is open.`
      : spec.exitCommand
        ? 'All tasks done — ready to escape the system.'
        : 'All tasks done.'
    : exitName
      ? `Complete the tasks below to unlock ${exitName}.`
      : spec.exitCommand
        ? 'Complete the tasks below to escape the system.'
        : tasks.length > 0
          ? 'Complete the tasks below to finish this sector.'
          : 'Explore this sector — no active tasks yet.';

  return { title: spec.title, goal, tasks, exitReady };
}
