import type { KernelEvent } from '../contracts/events.js';

export interface Word {
  text: string;
  quote: 'none' | 'single' | 'double';
}

export interface Command {
  words: Word[];
  redirect?: { target: Word; append: boolean };
}

export interface PipelineItem {
  op: null | ';' | '&&' | '||';
  commands: Command[];
}

export interface Step {
  stdout: string;
  stderr: string;
  code: number;
  events: KernelEvent[];
  clear?: boolean;
  /** Messages for the player that are neither data (never piped) nor errors. */
  info?: string;
}

export interface Host {
  dispatch(argv: string[], stdin: string): Step;
  expand(word: Word): string[];
  writeRedirect(path: string, data: string, append: boolean, argv: string[]): Step;
}

type Tok =
  | { kind: 'word'; word: Word }
  | { kind: 'op'; op: string };

function lex(line: string): Tok[] | { error: string } {
  const out: Tok[] = [];
  let i = 0;
  const ops = ['&&', '||', '>>', '>', '|', ';'];
  while (i < line.length) {
    const ch = line[i] ?? '';
    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }
    const op = ops.find((candidate) => line.startsWith(candidate, i));
    if (op) {
      out.push({ kind: 'op', op });
      i += op.length;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch === '"' ? 'double' : 'single';
      i += 1;
      let text = '';
      while (i < line.length && line[i] !== ch) {
        text += line[i];
        i += 1;
      }
      if (i >= line.length) return { error: 'syntax error: unmatched quote\n' };
      i += 1;
      out.push({ kind: 'word', word: { text, quote } });
      continue;
    }
    let text = '';
    while (i < line.length) {
      const cur = line[i] ?? '';
      if (cur === ' ' || cur === '\t' || cur === '"' || cur === "'") break;
      if (ops.some((candidate) => line.startsWith(candidate, i))) break;
      text += cur;
      i += 1;
    }
    out.push({ kind: 'word', word: { text, quote: 'none' } });
  }
  return out;
}

function parse(tokens: Tok[]): PipelineItem[] | { error: string } {
  const items: PipelineItem[] = [];
  let op: PipelineItem['op'] = null;
  let i = 0;
  const listOp = (token: Tok) => token.kind === 'op' && (token.op === ';' || token.op === '&&' || token.op === '||');

  while (i < tokens.length) {
    const commands: Command[] = [];
    if (i >= tokens.length) return { error: 'syntax error\n' };
    while (i < tokens.length && !listOp(tokens[i]!)) {
      const words: Word[] = [];
      let redirect: Command['redirect'];
      while (i < tokens.length && !listOp(tokens[i]!) && !(tokens[i]!.kind === 'op' && tokens[i]!.kind === 'op' && (tokens[i] as { op: string }).op === '|')) {
        const tok = tokens[i]!;
        if (tok.kind === 'op' && (tok.op === '>' || tok.op === '>>')) {
          const next = tokens[i + 1];
          if (!next || next.kind !== 'word') return { error: 'syntax error: redirect\n' };
          redirect = { target: next.word, append: tok.op === '>>' };
          i += 2;
          continue;
        }
        if (tok.kind !== 'word') return { error: 'syntax error\n' };
        words.push(tok.word);
        i += 1;
      }
      if (words.length === 0) return { error: 'syntax error\n' };
      commands.push({ words, redirect });
      if (i < tokens.length && tokens[i]!.kind === 'op' && (tokens[i] as { op: string }).op === '|') {
        i += 1;
        if (i >= tokens.length) return { error: 'syntax error: pipe\n' };
      }
    }
    items.push({ op, commands });
    if (i < tokens.length && listOp(tokens[i]!)) {
      op = (tokens[i] as { op: ';' | '&&' | '||' }).op;
      i += 1;
      if (i >= tokens.length) return { error: 'syntax error\n' };
    }
  }
  return items;
}

function argvOf(cmd: Command, host: Host): string[] {
  const argv: string[] = [];
  for (const word of cmd.words) argv.push(...host.expand(word));
  return argv;
}

export interface LineResult {
  /** stdout, stderr and info interleaved in order. */
  output: string;
  /** Only the stderr part. */
  stderr: string;
  events: KernelEvent[];
  code: number;
  clear?: boolean;
}

export function runLine(line: string, host: Host): LineResult {
  const tokens = lex(line);
  if ('error' in tokens) return { output: tokens.error, stderr: tokens.error, events: [], code: 2 };
  if (tokens.length === 0) return { output: '', stderr: '', events: [], code: 0 };
  const items = parse(tokens);
  if ('error' in items) return { output: items.error, stderr: items.error, events: [], code: 2 };

  let output = '';
  let stderr = '';
  const events: KernelEvent[] = [];
  let code = 0;
  let clear = false;
  for (const item of items) {
    if (item.op === '&&' && code !== 0) continue;
    if (item.op === '||' && code === 0) continue;
    let pipe = '';
    let shown = '';
    let notes = '';
    let redirected = false;
    for (const cmd of item.commands) {
      const argv = argvOf(cmd, host);
      if (argv.length === 0) return { output: `${output}syntax error\n`, stderr: `${stderr}syntax error\n`, events, code: 2, clear };
      const step = host.dispatch(argv, pipe);
      shown += step.stderr;
      notes += step.info ?? '';
      stderr += step.stderr;
      events.push(...step.events);
      if (step.clear) clear = true;
      code = step.code;
      if (cmd.redirect) {
        const target = host.expand(cmd.redirect.target);
        const path = target[0] ?? cmd.redirect.target.text;
        const wrote = host.writeRedirect(path, step.stdout, cmd.redirect.append, argv);
        // A redirect's own stdout is a message (a socket answering), never data.
        shown += wrote.stderr + wrote.stdout;
        notes += wrote.info ?? '';
        stderr += wrote.stderr;
        events.push(...wrote.events);
        if (wrote.code !== 0) code = wrote.code;
        if (wrote.clear) clear = true;
        pipe = '';
        redirected = true;
      } else {
        pipe = step.stdout;
        redirected = false;
      }
    }
    if (!redirected) shown += pipe;
    output += shown + notes;
  }
  return { output, stderr, events, code, clear };
}
