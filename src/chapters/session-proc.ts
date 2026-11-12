import type { KernelEvent, PosixSignal } from '../contracts/events.js';
import type { KillHow } from '../game/entities.js';
import type { Step } from '../game/shell.js';
import { psXrayToggle } from '../game/puzzle.js';
import { WEAK_GGUF, kiroIsWeak, levelScript, runSteps } from './script.js';
import { emptyStep, okStep, type ChapterState } from './session-state.js';
import { computeBossPhase, refreshExitGates } from './session-rules.js';

export function cmdPs(g: ChapterState, cmd: string): Step {
    const events: KernelEvent[] = [];
    g.rt.commandsRun.add('ps');
    g.rt.world.revealProcesses(events);
    if (cmd === 'top') g.rt.xray = !g.rt.xray;
    const rows = g.rt.world.procs();
    events.push(psXrayToggle(rows));
    const kiroGguf = kiroIsWeak(g) ? WEAK_GGUF : g.kiro.activeCore.gguf;
    const header = '  PID  PPID USER     STATE     %CPU COMMAND\n';
    const body = [
      ' 4242  4200 dev      RUNNING    1.0 -bash',
      `  777  4242 dev      RUNNING    2.4 kiro.d --gguf ${kiroGguf}`,
      ...rows.map(
        (r) =>
          `${String(r.pid).padStart(5, ' ')} ${String(r.ppid).padStart(5, ' ')} ${r.user.padEnd(8, ' ')} ${r.state.padEnd(9, ' ')} ${String(r.cpu).padStart(4, ' ')} ${r.name}`,
      ),
    ].join('\n');
    return okStep(`${header}${body}\n`, events);
  }

export function cmdKill(g: ChapterState, args: string[]): Step {
    const events: KernelEvent[] = [];
    let sig: PosixSignal = 'SIGTERM';
    const pids: number[] = [];

    for (const a of args) {
      const upper = a.toUpperCase();
      if (upper === '-9' || upper === '-KILL' || upper === '-SIGKILL') sig = 'SIGKILL';
      else if (upper === '-15' || upper === '-TERM' || upper === '-SIGTERM') sig = 'SIGTERM';
      else if (upper === '-STOP' || upper === '-SIGSTOP' || upper === '-19') sig = 'SIGSTOP';
      else if (upper === '-CONT' || upper === '-SIGCONT' || upper === '-18') sig = 'SIGCONT';
      else {
        const n = Number(a);
        if (!Number.isInteger(n)) return emptyStep(1, `kill: ${a}: arguments must be process IDs\n`);
        pids.push(n);
      }
    }
    if (pids.length === 0) return emptyStep(1, 'usage: kill [-9 | -15 | -STOP | -CONT] PID...\n');
    sig = levelScript(g).signalAliases?.[sig] ?? sig;

    const HowMap: Record<PosixSignal, KillHow> = {
      SIGKILL: 'SIGKILL',
      SIGTERM: 'SIGTERM',
      SIGSTOP: 'other',
      SIGCONT: 'other',
    };
    g.rt.world.cause = HowMap[sig];
    const hasBossRule = g.rt.spec.winRules.some((r) => r.kind === 'boss_defeated');

    let stdout = '';
    let stderr = '';
    let code = 0;
    for (const pid of pids) {
      if (pid === 4242) {
        stderr += 'kill: 4242: refusing to terminate your own rescue shell!\n';
        code = 1;
        continue;
      }
      if (pid === 777) {
        stderr += 'kill: 777: refusing to terminate kiro.d — your local Ghost companion has your six!\n';
        code = 1;
        continue;
      }
      if (pid === 1 && hasBossRule) {
        const phase = computeBossPhase(g);
        if (phase < 3) {
          stderr += `kill: (1): Operation not permitted — kernel anchors still shield PID 1 (${phase}/3 disarmed)\n`;
          code = 1;
          continue;
        }
        const bossName = g.pack.manifest.boss.name;
        events.push({ type: 'PROC_SIGNALED', pid: 1, signal: sig, outcome: 'KILLED' });
        events.push({ type: 'VIBECODER_ACTION', action: 'cast', command: `kill ${sig}` });
        const onKill = levelScript(g).onBossKill;
        stdout += onKill
          ? runSteps(g, onKill, events, { boss: bossName })
          : `[SIGKILL -> PID 1] ${bossName} kernel grip severed! Type \`exit\` to complete deployment.\n`;
        continue;
      }
      const res = g.rt.world.signal(pid, sig, events);
      if (!res) {
        stderr += `kill: (${pid}) - No such process\n`;
        code = 1;
        continue;
      }
      stdout += res.stdout;
      stderr += res.stderr;
      if (res.code !== 0) code = res.code;
      events.push({ type: 'VIBECODER_ACTION', action: 'cast', command: `kill ${sig}` });
    }

    g.rt.world.sync(events);
    refreshExitGates(g, events);
    return okStep(stdout, events, code, stderr);
  }
