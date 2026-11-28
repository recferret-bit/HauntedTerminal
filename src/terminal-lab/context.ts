import type { EnemyType } from '../game/bestiary.js';
import { isRegexPattern } from '../chapters/session-lab-checks.js';
import { baseName, parentDir } from '../game/tree.js';
import type { LabScript, LabSetupOp } from './lab-types.js';

/**
 * Commands that act on the selected object, so you can poke it without remembering the syntax.
 * Written from what the game teaches about each thing (`BESTIARY[type].weakness`, the pickup blurbs, the win rules).
 */
export interface ContextCommand {
  /** What the line does, in a few words. */
  why: string;
  line: string;
}

/** A name the player types from the room: bare when the file is in it, else the full path. */
const rel = (path: string, cwd: string): string => (parentDir(path) === cwd ? baseName(path) : path);
const cmd = (why: string, line: string): ContextCommand => ({ why, line });

type Enemy = Extract<LabSetupOp, { op: 'enemy' }>;
interface EnemyView {
  e: Enemy;
  file: string;
  pid: number | undefined;
  port: string | undefined;
  buffer: string | undefined;
}

/** What to try against each enemy type. Typed over every `EnemyType`: a new enemy cannot ship without its tips. */
const ENEMY_TIPS: Record<EnemyType, (v: EnemyView) => ContextCommand[]> = {
  virus: (v) => [cmd('find its PID', 'ps'), ...(v.pid ? [cmd('kill it', `kill -9 ${v.pid}`)] : []), cmd('delete its file', `rm ${v.file}`)],
  worm: (v) => [...(v.port ? [cmd('seal its port: it starves', `chmod 000 ${v.port}`)] : []), cmd('find its PID', 'ps'), ...(v.pid ? [cmd('kill it', `kill -9 ${v.pid}`)] : [])],
  trojan: (v) => [cmd('petrify it: no execute bit', `chmod -x ${v.file}`), cmd('read its strings', `cat ${v.file}`)],
  bug: (v) => [cmd('find the bug', `grep BUG ${v.file}`), cmd('fix it', `sed -i 's/BUG/FIXED/' ${v.file}`)],
  exploit: (v) => [...(v.buffer ? [cmd('make its buffer read-only', `chmod -w ${v.buffer}`), cmd('look at the buffer', `ls -l ${v.buffer}`)] : [])],
  crack: (v) => [
    cmd('find its PID', 'ps'),
    ...(v.pid ? [cmd('kill it', `kill -9 ${v.pid}`)] : []),
    ...(v.port ? [cmd('seal the worm port it picks', `chmod 000 ${v.port}`)] : []),
  ],
  ransomware: (v) => [cmd('find its PID', 'ps'), ...(v.pid ? [cmd('kill it', `kill -9 ${v.pid}`)] : []), cmd('see what it encrypted', 'ls -l')],
  spyware: (v) => [cmd('light the Tube Transistor', 'ls -a'), cmd('find its PID', 'ps'), cmd('delete it', `rm ${v.file}`)],
  rootkit: (v) => [cmd('light the Tube Transistor: it shows only with the long listing', 'ls -la'), cmd('find its PID', 'ps'), cmd('delete its file', `rm ${v.file}`)],
  zombie: (v) => [cmd('find its PID', 'ps'), ...(v.pid ? [cmd('kill it', `kill -9 ${v.pid}`)] : [])],
  forkbomb: (v) => [cmd('find its PID', 'ps'), ...(v.pid ? [cmd('freeze it', `kill -STOP ${v.pid}`), cmd('kill it', `kill -9 ${v.pid}`)] : [])],
  kernel: (v) => [cmd('find its PID', 'ps'), ...(v.pid ? [cmd('freeze it', `kill -STOP ${v.pid}`), cmd('kill it', `kill -9 ${v.pid}`)] : [])],
};

function enemyLines(e: Enemy, cwd: string, setup: readonly LabSetupOp[]): ContextCommand[] {
  const helped = e.helps
    ? setup.find((op): op is Enemy => op.op === 'enemy' && op.id === e.helps)
    : undefined;
  const portPath = e.port ?? helped?.port;
  const view: EnemyView = {
    e,
    file: rel(e.path, cwd),
    pid: e.pid,
    port: portPath ? rel(portPath, cwd) : undefined,
    buffer: e.buffer ? rel(e.buffer, cwd) : undefined,
  };
  return [cmd('read about it', `man ${e.type}`), ...ENEMY_TIPS[e.type](view)];
}

type Rule = Extract<LabSetupOp, { op: 'task' }>['rule'];

function ruleLines(rule: Rule, cwd: string): ContextCommand[] {
  switch (rule.kind) {
    case 'read_file':
      return [cmd('read it', `cat ${rel(rule.path, cwd)}`)];
    case 'talk_ally':
      return [cmd('talk to the ally', `cat ${rule.socket}`)];
    case 'riddle_solved':
      return [cmd('ask the ally', 'hank')];
    case 'file_absent':
      return [cmd('remove it', `rm ${rel(rule.path, cwd)}`)];
    case 'file_contains':
      return [cmd('look at it', `cat ${rel(rule.path, cwd)}`), cmd('edit it', `edit ${rel(rule.path, cwd)}`)];
    case 'dir_accessible':
      return [cmd('open it', `chmod 755 ${rel(rule.path, cwd)}`)];
    case 'kiro_decrypted':
      return [cmd('have Kiro.d crack it', `kiro crack ${rel(rule.path, cwd)}`)];
    case 'kiro_loaded':
      return [cmd('load the core', `kiro load ${rule.core}`), cmd('see the cores', 'kiro')];
    case 'enemy_neutralized':
      return [cmd('find it', 'ps')];
    case 'html_css_valid':
      return [cmd('edit the page', `edit ${rel(rule.htmlPath, cwd)}`), cmd('edit the styles', `edit ${rel(rule.cssPath, cwd)}`)];
    case 'cart_js_valid':
    case 'payment_js_valid':
      return [cmd('edit the script', `edit ${rel(rule.jsPath, cwd)}`)];
    case 'laptop_tasks_done':
      return [cmd('see inventory', 'inventory'), cmd('ask the ally', 'hank')];
    case 'docker_image_running':
      return [cmd('edit the Dockerfile', 'edit Dockerfile'), cmd('build the image', `docker build -t ${rule.imageTag} .`), cmd('run it', `docker run -d -p ${rule.port}:${rule.port} ${rule.imageTag}`)];
    case 'docker_compose_healthy':
      return [cmd('edit the stack', 'edit docker-compose.yml'), cmd('bring it up', 'docker compose up -d')];
    case 'boss_defeated':
      return [cmd('read the socket', `cat ${rule.verifySocket}`), cmd('look at the anchor', `cat ${rel(rule.anchorPath, cwd)}`), cmd('find the boss', 'ps')];
  }
}

function opLines(op: LabSetupOp, cwd: string, setup: readonly LabSetupOp[]): ContextCommand[] {
  switch (op.op) {
    case 'enemy':
      return enemyLines(op, cwd, setup);
    case 'pickup': {
      const f = rel(op.path, cwd);
      return [cmd('read it', `cat ${f}`), ...(op.locked ? [cmd('decrypt it', `chmod 644 ${f}`)] : []), cmd('load it', `source ${f}`), cmd('collect it', `mv ${f} ~`)];
    }
    case 'file': {
      const f = rel(op.path, cwd);
      return [cmd('read it', `cat ${f}`), cmd('first lines', `head -n 3 ${f}`), cmd('count lines', `wc -l ${f}`), cmd('edit it', `edit ${f}`), cmd('lock it', `chmod 000 ${f}`), cmd('delete it', `rm ${f}`)];
    }
    case 'dir': {
      const d = rel(op.path, cwd);
      return [cmd('walk in', `cd ${d}`), cmd('look inside', `ls ${d}`), cmd('open it', `chmod 755 ${d}`), cmd('lock it', `chmod 000 ${d}`)];
    }
    case 'socket': {
      const s = rel(op.path, cwd);
      return [cmd('let it speak', `cat ${s}`), cmd('talk to it', `echo hello > ${s}`)];
    }
    case 'riddle': {
      const s = rel(op.path, cwd);
      const plain = !isRegexPattern(op.answer);
      return [cmd('let it speak', `cat ${s}`), cmd('a wrong answer', `echo nope > ${s}`), ...(plain ? [cmd('the right answer', `echo ${op.answer} > ${s}`)] : []), cmd('ask the ally', 'hank')];
    }
    case 'patch':
      return [cmd('open the file', `edit ${op.file}`)];
    case 'task':
      return ruleLines(op.rule, cwd);
    case 'check':
      return op.when.kind === 'file' ? [cmd('look at the file', `cat ${rel(op.when.path, cwd)}`)] : [];
    case 'dialogue':
      return [cmd('read the speaker', `cat ${op.anchorSocket}`)];
    case 'prop':
    case 'npc':
    case 'taunt':
      return [];
  }
}

export interface ContextSelection {
  setup: number | null;
  step: number | null;
}

/** Commands for the selected setup object or script step; empty when nothing is selected. */
export function contextCommands(script: LabScript, sel: ContextSelection): ContextCommand[] {
  const cwd = script.room.cwd;
  if (sel.step !== null) {
    const step = script.steps[sel.step];
    return step?.op === 'run' ? [cmd('run this step by hand', step.line)] : [];
  }
  const op = sel.setup === null ? undefined : script.setup[sel.setup];
  return op ? opLines(op, cwd, script.setup) : [];
}
