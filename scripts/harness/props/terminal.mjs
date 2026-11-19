// Terminal properties: the shell and its virtual file system, played through the same exec path the game uses, on BOTH shells
// ("two shells, one behaviour"): the chapter shell (a Terminal Lab session: a throwaway one-room pack with no enemies) and
// the classic shell (classic floor 2 in a lab, files made with `echo`). Spec: .kiro/specs/property-based-tests/.
import fc from 'fast-check';
import { fileName, readableMode, shellLine, twoNames } from './arbitraries.mjs';
import { expect } from './kit.mjs';

const ROOM = '/lab';
const notReadme = (n) => n !== 'readme.txt';
/** Names the classic floor already holds in its start room; a property file must not collide with them. */
const CLASSIC_TAKEN = /^(archivist_gate|iron_gate|port_|prod|todo|ram_|energy|intercom)/;
const usable = (n) => notReadme(n) && !CLASSIC_TAKEN.test(n);

/** One line of file content that survives `echo '<line>' > f` in either shell. */
const oneLine = fc.stringMatching(/^[a-z0-9][a-z0-9 ]{0,24}$/);
const shellKind = fc.constantFrom('chapter', 'classic');

/** `-rw-r-----` for `640`: the string `ls -l` prints for a plain file with that mode. */
export function modeText(octal) {
  const bits = 'rwx';
  return `-${[...octal].map((d) => [0, 1, 2].map((i) => (Number(d) & (4 >> i) ? bits[i] : '-')).join('')).join('')}`;
}

export default async function terminalSuite({ load }) {
  const { openLabSession } = await load('/src/terminal-lab/node-driver.ts');
  const { newLabScript } = await load('/src/terminal-lab/lab-pack.ts');

  /** A fresh session on `kind` holding `files` (`{ name: oneLineContent }`), each file's content being `<line>\n`. */
  const room = (kind, files = {}) => {
    const script = newLabScript('props-terminal');
    if (kind === 'classic') script.driver = 'classic';
    else for (const [name, line] of Object.entries(files)) script.setup.push({ op: 'file', path: `${ROOM}/${name}`, content: `${line}\n` });
    const session = openLabSession(script);
    if (kind === 'classic') for (const [name, line] of Object.entries(files)) session.exec(`echo '${line}' > ${name}`);
    return session;
  };
  const listed = (session) => session.exec('ls').output.split(/\s+/).map((n) => n.replace(/\/$/, ''));

  return [
    {
      name: 'the shell never throws on any input line (both shells)',
      // Found by this property: `mv .. j` moved a folder into itself; the tree became a loop and the next path walk crashed
      // or hung (fixed in session-fs.ts cmdMv).
      examples: [['chapter', ['mv .. j', 'ls']], ['chapter', ['>> "w" mv .. j_2 d.txt']]],
      build: () =>
        fc.property(shellKind, fc.array(shellLine, { minLength: 1, maxLength: 5 }), (kind, lines) => {
          const session = room(kind, { 'a.txt': 'alpha', 'notes.log': 'BUG here' });
          for (const line of lines) {
            const r = session.exec(line);
            expect(typeof r.output === 'string' && (r.code === undefined || Number.isInteger(r.code)), `bad result for ${JSON.stringify(line)} on ${kind}`);
          }
        }),
    },
    {
      name: '`cp a b` then `cat b` prints what `cat a` prints (both shells)',
      build: () =>
        fc.property(shellKind, twoNames.filter(([a, b]) => usable(a) && usable(b)), oneLine, (kind, [a, b], line) => {
          const session = room(kind, { [a]: line });
          const before = session.exec(`cat ${a}`).output;
          expect(session.exec(`cp ${a} ${b}`).code === 0, `cp ${a} ${b} failed on ${kind}`);
          const copy = session.exec(`cat ${b}`).output;
          expect(copy === before, `${kind}: cat ${b} printed ${JSON.stringify(copy)}, cat ${a} printed ${JSON.stringify(before)}`);
        }),
    },
    {
      name: '`mv a b` keeps the content and removes `a` (both shells)',
      build: () =>
        fc.property(shellKind, twoNames.filter(([a, b]) => usable(a) && usable(b)), oneLine, (kind, [a, b], line) => {
          const session = room(kind, { [a]: line });
          const before = session.exec(`cat ${a}`).output;
          expect(session.exec(`mv ${a} ${b}`).code === 0, `mv ${a} ${b} failed on ${kind}`);
          expect(session.exec(`cat ${b}`).output === before, `${kind}: ${b} lost its content`);
          expect(!listed(session).includes(a), `${kind}: ls still lists ${a}`);
          expect(session.exec(`cat ${a}`).code !== 0, `${kind}: cat ${a} still works`);
        }),
    },
    {
      name: 'after `chmod <mode> f`, `ls -l f` and `ls -l` show that mode (both shells)',
      // Found by this property: the chapter shell printed only the name for `ls -l <file>` (fixed in session-fs.ts).
      examples: [['chapter', 'a', '400']],
      build: () =>
        fc.property(shellKind, fileName.filter(usable), readableMode, (kind, name, mode) => {
          const session = room(kind, { [name]: 'x' });
          expect(session.exec(`chmod ${mode} ${name}`).code === 0, `chmod ${mode} ${name} failed on ${kind}`);
          const want = modeText(mode);
          const single = session.exec(`ls -l ${name}`).output;
          expect(single.startsWith(want) && single.trimEnd().endsWith(name), `${kind}: ls -l ${name} printed ${JSON.stringify(single)}, want ${want}`);
          const row = session.exec('ls -l').output.split('\n').find((l) => l.split(/\s+/).at(-1) === name);
          expect(row?.startsWith(want), `${kind}: ls -l row ${JSON.stringify(row)}, want ${want}`);
        }),
    },
    {
      name: 'a file nobody can read cannot be copied: `cp` fails and creates nothing (both shells)',
      // Found by review: the chapter shell copied a mode-000 file that `cat` refuses; the classic shell already refused (parity fix).
      examples: [['chapter', ['a.txt', 'b.txt'], 'alpha']],
      build: () =>
        fc.property(shellKind, twoNames.filter(([a, b]) => usable(a) && usable(b)), oneLine, (kind, [a, b], line) => {
          const session = room(kind, { [a]: line });
          expect(session.exec(`chmod 000 ${a}`).code === 0, `chmod 000 ${a} failed on ${kind}`);
          expect(session.exec(`cat ${a}`).code !== 0, `${kind}: cat ${a} should be denied`);
          const r = session.exec(`cp ${a} ${b}`);
          expect(r.code !== 0 && /permission denied/i.test(r.output), `${kind}: cp ${a} ${b} gave ${JSON.stringify(r.output)} code ${r.code}`);
          expect(!listed(session).includes(b), `${kind}: cp created ${b} from an unreadable file`);
        }),
    },
    {
      name: '`sed` with an empty pattern is refused and changes nothing (both shells)',
      // Found by review: `s//x/g` inserted x between every character; GNU sed has no previous expression and refuses.
      examples: [['chapter', ['/', 'x', 'g'], 'alpha'], ['classic', [',', '', ''], 'alpha']],
      build: () =>
        fc.property(shellKind, fc.constantFrom('/', ',', '|', '#').chain((d) => fc.tuple(fc.constant(d), fc.stringMatching(/^[a-z]{0,4}$/), fc.constantFrom('', 'g'))), oneLine, (kind, [d, repl, flag], line) => {
          const session = room(kind, { 'a.txt': line });
          const script = `s${d}${d}${repl}${d}${flag}`;
          const piped = session.exec(`sed '${script}' a.txt`);
          expect(piped.code !== 0 && /no previous regular expression/.test(piped.output), `${kind}: sed '${script}' gave ${JSON.stringify(piped.output)} code ${piped.code}`);
          expect(session.exec(`sed -i '${script}' a.txt`).code !== 0, `${kind}: sed -i '${script}' succeeded`);
          expect(session.exec('cat a.txt').output === `${line}\n`, `${kind}: sed -i changed the file`);
        }),
    },
    {
      name: 'a failed `cd` names the missing path exactly once (both shells)',
      // Found by QA: the chapter shell printed `cd: nowhere: No such file or directory: nowhere`.
      examples: [['chapter', 'nowhere'], ['classic', 'nowhere']],
      build: () =>
        fc.property(shellKind, fileName.filter(usable), (kind, name) => {
          const session = room(kind, {});
          const r = session.exec(`cd ${name}_missing`);
          const count = r.output.split(`${name}_missing`).length - 1;
          expect(r.code !== 0 && count === 1, `${kind}: cd ${name}_missing gave ${JSON.stringify(r.output)} (path ${count}x)`);
        }),
    },
    {
      name: 'after `rm f`, `ls` never lists `f` (both shells)',
      build: () =>
        fc.property(shellKind, fc.uniqueArray(fileName.filter(usable), { minLength: 1, maxLength: 4 }), fc.nat(), (kind, names, pick) => {
          const session = room(kind, Object.fromEntries(names.map((n) => [n, n.replace(/[^a-z0-9]/g, '')])));
          const gone = names[pick % names.length];
          expect(session.exec(`rm ${gone}`).code === 0, `rm ${gone} failed on ${kind}`);
          const left = listed(session);
          expect(!left.includes(gone), `${kind}: ls still lists ${gone}`);
          for (const n of names) if (n !== gone) expect(left.includes(n), `${kind}: rm ${gone} also removed ${n}`);
        }),
    },
  ];
}
