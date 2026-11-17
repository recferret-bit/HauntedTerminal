/**
 * Loop protection for page code (the way CodePen does it): every `while (c)` becomes
 * `while (__lg(N) && (c))` and every `for (a; b; c)` gets the same check in its condition, so an
 * endless loop throws a readable error instead of freezing the tab. `__lg` lives in the sandbox
 * (bridge.ts); `N` is the loop's line in the player's file. `for...in` / `for...of` end with their
 * collection and are left alone; `do ... while` is covered by its `while`.
 *
 * A small lexer finds the code between comments, strings, template literals and regexes. Source it
 * cannot read safely (an unterminated string, an unbalanced bracket) comes back unchanged.
 */

type Kind = 'word' | 'punct' | 'skip';

interface Token {
  kind: Kind;
  text: string;
  start: number;
  end: number;
  line: number;
}

class Unreadable extends Error {}

/** After these, a `/` starts a regex rather than a division. */
const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);

function regexAllowed(prev: Token | undefined): boolean {
  if (!prev) return true;
  if (prev.kind === 'word') return REGEX_AFTER_WORDS.has(prev.text);
  return !(prev.kind === 'punct' && (prev.text === ')' || prev.text === ']' || prev.text === '}'));
}

/** Index just past a quoted string starting at `i`. */
function endOfString(src: string, i: number): number {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === q) return j + 1;
    else if (src[j] === '\n') break;
  }
  throw new Unreadable();
}

/** Index just past a regex literal (and its flags) starting at `i`. */
function endOfRegex(src: string, i: number): number {
  let inClass = false;
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') j++;
    else if (c === '\n') break;
    else if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      let k = j + 1;
      while (k < src.length && /[a-z]/i.test(src[k]!)) k++;
      return k;
    }
  }
  throw new Unreadable();
}

/** A template chunk from `i` (just after '`' or '}'): returns where it ends and whether `${` opened code. */
function endOfTemplateChunk(src: string, i: number): { end: number; opensCode: boolean } {
  for (let j = i; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === '`') return { end: j + 1, opensCode: false };
    else if (src[j] === '$' && src[j + 1] === '{') return { end: j + 2, opensCode: true };
  }
  throw new Unreadable();
}

/** Splits source into tokens; comments, strings, regexes and template text are `skip` tokens. */
function lex(src: string): Token[] {
  const tokens: Token[] = [];
  /** `{` pushes 'brace', `${` pushes 'tmpl': a `}` that closes a 'tmpl' resumes the template text. */
  const braces: ('brace' | 'tmpl')[] = [];
  let line = 1;
  let i = 0;
  let prev: Token | undefined;
  const push = (kind: Kind, end: number): void => {
    const tok = { kind, text: src.slice(i, end), start: i, end, line };
    tokens.push(tok);
    if (kind !== 'skip') prev = tok;
    for (let k = i; k < end; k++) if (src[k] === '\n') line++;
    i = end;
  };
  const template = (from: number): void => {
    const chunk = endOfTemplateChunk(src, from);
    if (chunk.opensCode) braces.push('tmpl');
    push('skip', chunk.end);
    // The template text is a value: a `/` right after it is a division.
    prev = { kind: 'punct', text: ')', start: i, end: i, line };
  };
  while (i < src.length) {
    const c = src[i]!;
    const two = src.slice(i, i + 2);
    if (/\s/.test(c)) push('skip', i + 1);
    else if (two === '//') { const nl = src.indexOf('\n', i); push('skip', nl < 0 ? src.length : nl); }
    else if (two === '/*') { const close = src.indexOf('*/', i + 2); if (close < 0) throw new Unreadable(); push('skip', close + 2); }
    else if (c === '"' || c === "'") push('skip', endOfString(src, i));
    else if (c === '`') template(i + 1);
    else if (c === '/' && regexAllowed(prev)) push('skip', endOfRegex(src, i));
    else if (/[\w$]/.test(c)) push('word', i + /^[\w$]+/.exec(src.slice(i))![0].length);
    else if (c === '}' && braces[braces.length - 1] === 'tmpl') { braces.pop(); template(i + 1); }
    else {
      if (c === '{') braces.push('brace');
      if (c === '}' && !braces.pop()) throw new Unreadable();
      push('punct', i + 1);
    }
  }
  if (braces.length) throw new Unreadable();
  return tokens;
}

interface Edit {
  at: number;
  text: string;
}

/** Index (in `code`) of the `)` that closes the `(` at `open`. */
function closingParen(code: Token[], open: number): number {
  let depth = 0;
  for (let k = open; k < code.length; k++) {
    if (code[k]!.text === '(') depth++;
    else if (code[k]!.text === ')' && --depth === 0) return k;
  }
  throw new Unreadable();
}

/** The edits that guard one loop, given the keyword's index in `code` (significant tokens only). */
function guardEdits(code: Token[], at: number): Edit[] {
  const kw = code[at]!;
  const open = at + 1;
  const close = closingParen(code, open);
  const check = `__lg(${kw.line})`;
  if (kw.text === 'while') {
    return [{ at: code[open]!.end, text: `${check} && (` }, { at: code[close]!.start, text: ')' }];
  }
  let depth = 0;
  const semis: Token[] = [];
  for (let k = open + 1; k < close; k++) {
    const t = code[k]!.text;
    if (t === '(' || t === '[' || t === '{') depth++;
    else if (t === ')' || t === ']' || t === '}') depth--;
    else if (t === ';' && depth === 0) semis.push(code[k]!);
  }
  if (semis.length !== 2) return []; // for...in, for...of
  const [first, second] = semis as [Token, Token];
  const empty = code.indexOf(second) === code.indexOf(first) + 1;
  return empty ? [{ at: first.end, text: ` ${check}` }] : [{ at: first.end, text: ` ${check} && (` }, { at: second.start, text: ')' }];
}

export function guardLoops(src: string): string {
  try {
    const code = lex(src).filter((t) => t.kind !== 'skip');
    const edits: Edit[] = [];
    code.forEach((t, k) => {
      const before = code[k - 1]?.text;
      if ((t.text === 'while' || t.text === 'for') && code[k + 1]?.text === '(' && before !== '.') edits.push(...guardEdits(code, k));
    });
    let out = src;
    for (const e of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, e.at) + e.text + out.slice(e.at);
    return out;
  } catch (err) {
    if (err instanceof Unreadable) return src;
    throw err;
  }
}

/** Guards `code` that starts at offset `at` of `html`, so its line numbers count from the file's top. */
function guardAt(html: string, at: number, code: string): string {
  const before = html.slice(0, at).split('\n').length - 1;
  return guardLoops(`${'\n'.repeat(before)}${code}`).slice(before);
}

/**
 * Guards the JavaScript inside an HTML file: inline `<script>` blocks (not those with a `src`) and
 * `on...` attributes written without HTML entities. Code built from strings (`eval`, `setTimeout("...")`)
 * stays unguarded; the runner's watchdog covers it.
 */
export function guardHtmlScripts(html: string): string {
  const scripts = html.replace(/(<script\b(?![^>]*\bsrc\s*=)[^>]*>)([\s\S]*?)(<\/script\s*>)/gi,
    (_whole, open: string, body: string, close: string, at: number) => `${open}${guardAt(html, at + open.length, body)}${close}`);
  return scripts.replace(/(\son[a-z]+\s*=\s*)(["'])([^"'&]*)\2/gi,
    (_whole, name: string, q: string, code: string, at: number) => `${name}${q}${guardAt(scripts, at + name.length + 1, code)}${q}`);
}
