import { AGENTS } from './tutorial.js';

const ERROR_LINE = /^(?:[\w.\/-]+: .*(?:no such file|permission denied|command not found|not a directory|is a directory|missing operand|invalid option|too many levels|not permitted|cannot |unknown|bad )|syntax error|usage: |-?bash: )/i;

type Rgb = [number, number, number];

/** One colour per speaker tag: the AI agents and Kiro share the card colours, the human developer is gold. */
const SPEAKER_RGB: Record<string, Rgb> = {
  vibecoder: [255, 209, 102],
  clod: AGENTS.clod.rgb,
  gork: AGENTS.gork.rgb,
  codec: AGENTS.codec.rgb,
  antigravy: AGENTS.antigravy.rgb,
  kiro: AGENTS.kiro.rgb,
};

const SPEAKER_TAG = /^\[([A-Z][A-Z.-]*)(?: [^\]]*)?\]/;

/** `[GORK] text`, `[KIRO TUTORIAL 1/7] text`: the whole line in the speaker's colour, the tag bold. Null when not a speaker line. */
function speakerLine(line: string): string | null {
  const tag = SPEAKER_TAG.exec(line);
  if (!tag) return null;
  const rgb = SPEAKER_RGB[tag[1].toLowerCase().replace(/-/g, '').replace(/\.d$/, '')];
  if (!rgb) return null;
  const ink = `38;2;${rgb[0]};${rgb[1]};${rgb[2]}`;
  return `\x1b[1;${ink}m${tag[0]}\x1b[0;${ink}m${line.slice(tag[0].length)}\x1b[0m`;
}

/**
 * Colour speaker lines in the speaker's colour and error lines red (only lines with no ANSI of their own). With `stderr` (the session's error text)
 * a line is red when it is one of the stderr lines; without it, error-shaped lines are guessed.
 */
export function colourise(text: string, stderr?: string): string {
  const errs = stderr !== undefined ? new Set(stderr.split('\n').map((l) => l.trim()).filter(Boolean)) : null;
  return text
    .split('\n')
    .map((line) => {
      if (!line || line.includes('\x1b')) return line;
      const spoken = speakerLine(line);
      if (spoken) return spoken;
      const isErr = errs ? errs.has(line.trim()) : ERROR_LINE.test(line);
      return isErr ? `\x1b[1;31m${line}\x1b[0m` : line;
    })
    .join('\n');
}
