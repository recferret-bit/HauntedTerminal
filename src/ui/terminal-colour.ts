const ERROR_LINE = /^(?:[\w.\/-]+: .*(?:no such file|permission denied|command not found|not a directory|is a directory|missing operand|invalid option|too many levels|not permitted|cannot |unknown|bad )|syntax error|usage: |-?bash: )/i;

/**
 * Colour error lines red (only lines with no ANSI of their own). With `stderr` (the session's error text)
 * a line is red when it is one of the stderr lines; without it, error-shaped lines are guessed.
 */
export function colourise(text: string, stderr?: string): string {
  const errs = stderr !== undefined ? new Set(stderr.split('\n').map((l) => l.trim()).filter(Boolean)) : null;
  return text
    .split('\n')
    .map((line) => {
      if (!line || line.includes('\x1b')) return line;
      const isErr = errs ? errs.has(line.trim()) : ERROR_LINE.test(line);
      return isErr ? `\x1b[1;31m${line}\x1b[0m` : line;
    })
    .join('\n');
}
