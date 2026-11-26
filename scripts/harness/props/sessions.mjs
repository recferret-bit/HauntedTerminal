// The compiled chapter as a property playground: open any level the way the headless solver does (preview, nothing
// recorded), and generate random play as commands and ticks. Shared by the chapters and gameplay suites.
// Spec: .kiro/specs/property-based-tests/.
import fc from 'fast-check';
import { fileName, shellLine } from './arbitraries.mjs';

/** Commands any level understands, beyond the chapter's own solutions. */
const GENERIC = [
  'ls', 'ls -a', 'ls -la', 'ps', 'pwd', 'cd ..', 'cd ~', 'help', 'hank', 'hint', 'inventory', 'inv', 'hold tube_transistor', 'hold terminal',
  'hold laptop', 'hold manual', 'hold map', 'manual chmod', 'map', 'map 4', 'kiro', 'kiro scan', 'kiro load qwen', 'kiro load llama', 'kiro load deepseek', 'kiro load mistral', 'kiro load nope',
  'cat *', 'tutorial skip', 'kill -9 1', 'kill -STOP 1', 'chmod -x *', 'rm -rf *', 'exit',
  // Lines that exit non-zero: a wrong riddle answer, an unknown command, a syntax error.
  'echo wrong > dad.tty.sock', 'frobnicate --now', 'echo "unterminated', 'ls | | cat',
];

export async function chapterWorld({ load }) {
  const { CHAPTER_MANIFESTS, getChapterPack } = await load('/src/chapters/catalog.ts');
  const { createChapterSession } = await load('/src/chapters/chapter-session.ts');
  const pack = getChapterPack(CHAPTER_MANIFESTS[0].id);
  const levels = pack.levels;
  const solutions = [...new Set(levels.flatMap((l) => l.solutionCommands ?? []))];
  const fileNames = [...new Set(levels.flatMap((l) => (l.files ?? []).map((f) => f.path.split('/').pop())))];

  /** A level, entered the way the solver enters it (with the chapter's grants), intro skipped. */
  const open = (levelIdx, pidSeed = 1) => {
    // A fixed `pidSeed` keeps the random PIDs repeatable, so transcripts and shrunk counterexamples replay.
    const session = createChapterSession({ chapterId: pack.manifest.id, pack: structuredClone(pack), preview: true, startLevelId: levels[levelIdx].id, pidSeed });
    session.skipIntro();
    return session;
  };

  /** Like `open`, on a copy of the pack that `mutate(pack)` changed first (a manifest or a level edited the way a human would). */
  const openWith = (levelIdx, mutate) => {
    const copy = structuredClone(pack);
    mutate(copy);
    const session = createChapterSession({ chapterId: copy.manifest.id, pack: copy, preview: true, startLevelId: copy.levels[levelIdx].id, pidSeed: 1 });
    session.skipIntro();
    return session;
  };

  const command = fc.oneof(
    { weight: 4, arbitrary: fc.constantFrom(...solutions) },
    { weight: 3, arbitrary: fc.constantFrom(...GENERIC) },
    { weight: 2, arbitrary: fc.tuple(fc.constantFrom('cat', 'rm', 'source', 'mv', 'chmod 000', 'chmod 644', 'chmod -x', 'kiro crack'), fc.constantFrom(...fileNames)).map(([c, f]) => `${c} ${f}`) },
    { weight: 1, arbitrary: fc.tuple(fc.constantFrom('cat', 'rm', 'cd', 'touch'), fileName).map(([c, f]) => `${c} ${f}`) },
    { weight: 1, arbitrary: shellLine },
  );
  /** One step of play: a command line, or `{ tick: n }` (n world ticks with no input). */
  const step = fc.oneof({ weight: 4, arbitrary: command }, { weight: 1, arbitrary: fc.integer({ min: 1, max: 4 }).map((tick) => ({ tick })) });
  const play = fc.tuple(fc.nat(levels.length - 1), fc.array(step, { minLength: 1, maxLength: 20 }));

  /** Runs `steps` on `session`, calling `after(result, step)` after each command and each tick. */
  const drive = (session, steps, after = () => {}) => {
    for (const s of steps) {
      if (typeof s === 'string') after(session.exec(s), s);
      else for (let i = 0; i < s.tick; i++) after(session.tick(), s);
    }
  };

  return { pack, levels, open, openWith, play, drive };
}
