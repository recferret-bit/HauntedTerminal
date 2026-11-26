import type { KernelEvent } from '../contracts/events.js';
import type { Step } from '../game/shell.js';
import { hasWrite, makeNode, resolve } from '../game/tree.js';
import { isNodeHidden } from './script.js';
import { cmdHank, cmdHankAudit } from './session-meta.js';
import { riddleWrite } from './session-riddle.js';
import { refreshExitGates, sinkIntoNull, syncValidatedCodeBugs } from './session-rules.js';
import { creatableParent, emptyStep, okStep, type ChapterState } from './session-state.js';

export function writeRedirect(g: ChapterState, path: string, data: string, append: boolean, argv: string[]): Step {
  const events: KernelEvent[] = [];
  if (path === '/dev/null') {
    // Sinking a .stream file into /dev/null (`cat chaos_webhook.stream > /dev/null`) drains the stream!
    if (argv[0] === 'cat' && argv[1]) {
      const src = resolve(g.rt.cwd, argv[1], true).node;
      if (src && src.name.endsWith('.stream')) {
        src.content = '';
        g.rt.streamDrained = true;
        sinkIntoNull(g, events, src.id);
        return okStep('[STDERR STREAM DRAINED INTO /dev/null]\n', events);
      }
    }
    return okStep('', events);
  }

  const existing = resolve(g.rt.cwd, path, true);
  if (existing.node) {
    if (isNodeHidden(g, existing.node)) {
      return emptyStep(1, `bash: ${path}: Permission denied\n`);
    }
    if (existing.node.kind === 'socket') {
      const riddle = riddleWrite(g, existing.node, data);
      if (riddle) return riddle;
      const trimmed = data.trim();
      g.rt.socketInputs.set(existing.node.name, trimmed);
      if (existing.node.name.includes('hank') || existing.node.name.includes('dad')) {
        if (/^(status|check|audit|review)\b/i.test(trimmed)) {
          return cmdHankAudit(g);
        }
        return cmdHank(g, []);
      }
      events.push({
        type: 'PUZZLE_DOOR_RESOLVED',
        socketInodeId: existing.node.id,
        unlockedInodeId: existing.node.id,
        solvedViaInput: trimmed,
      });
      g.rt.world.sync(events);
      refreshExitGates(g, events);
      return okStep(`[SOCKET ${existing.node.name}] ACK <- "${trimmed}"\n`, events);
    }
    if (existing.node.kind === 'dir') {
      return emptyStep(1, `bash: ${path}: Is a directory\n`);
    }
    if (!hasWrite(existing.node)) {
      events.push({ type: 'PERMISSION_DENIED_RATTLE', targetId: existing.node.id, command: '>' });
      return okStep('', events, 1, `bash: ${path}: Permission denied\n`);
    }
    existing.node.content = append ? existing.node.content + data : data;
    events.push({
      type: 'VIBECODER_ACTION',
      action: 'write',
      command: argv[0] ?? '>',
      targetEntityId: g.rt.world.entityOf(existing.node.id),
    });
    syncValidatedCodeBugs(g);
    g.rt.world.sync(events);
    refreshExitGates(g, events);
    return okStep('', events);
  }

  const placed = creatableParent(g.rt.root, g.rt.cwd, path);
  if (!placed) return emptyStep(1, `bash: ${path}: No such directory or permission denied\n`);
  const created = makeNode(placed.parent, placed.name, 'file', 0o644);
  created.content = data;
  events.push({ type: 'FILE_CREATED', inodeId: created.id, name: created.name });
  return okStep('', events);
}
