import { formatChmodPreview } from '../game/manual-catalog.js';
import type { ManualWidgetKind } from '../game/manual-types.js';
import { el } from './dom-lite.js';
import { btn, commandBar, inlineCodeFragment, type BookActions } from './manual-book-dom.js';

const CHMOD_PRESETS: ReadonlyArray<{ label: string; mode: number; hint: string }> = [
  { label: '755 Dir / Exec', mode: 0o755, hint: 'Owner rwx (7), Group & Others r-x (5). Standard unlocked directory or executable.' },
  { label: '644 File / Decrypt', mode: 0o644, hint: 'Owner rw- (6), Group & Others r-- (4). Decrypts ransomware-locked 000 pickups!' },
  { label: '600 Private RW', mode: 0o600, hint: 'Owner rw- (6), Group & Others --- (0). Standard for private SSH keys & .env secrets.' },
  { label: '700 Owner Dir', mode: 0o700, hint: 'Owner rwx (7), Group & Others --- (0). Private owner-only directory or script.' },
  { label: '444 Read-Only', mode: 0o444, hint: 'Everyone r-- (4). Makes stack.buf/proxy.buf unwritable so buffer exploits segfault.' },
  { label: '400 Private R', mode: 0o400, hint: 'Owner r-- (4), Group/Others --- (0). Read-only by owner only.' },
  { label: '000 Seal / Lock', mode: 0o000, hint: 'Zero permissions for all. Seals port_445 to starve a network worm.' },
  { label: '777 Open All', mode: 0o777, hint: 'Everyone rwx (7). Full access for every user (avoid on real servers).' },
];

const SIGNAL_CASES: ReadonlyArray<{
  id: string;
  flag: string;
  num: string;
  name: string;
  trappable: string;
  children: string;
  linuxMeaning: string;
  gameEffect: string;
  command: string;
}> = [
  {
    id: 'term',
    flag: '-15',
    num: '15',
    name: 'SIGTERM (Default)',
    trappable: 'YES — Process can catch, handle, or ignore it',
    children: 'Only hits the target PID (children may survive)',
    linuxMeaning: 'Default when you type `kill <pid>` without flags. Asks the app to flush logs, close sockets, and exit gracefully.',
    gameEffect: 'Kills `crack`, `worm`, `ransomware`, and `spyware`, BUT `virus` ignores it and `forkbomb` (666) traps it and retaliates for 18 HP!',
    command: 'kill -15 <pid>',
  },
  {
    id: 'kill',
    flag: '-9',
    num: '9',
    name: 'SIGKILL (Force Kill)',
    trappable: 'NO — Enforced directly by the kernel (UNTRAPPABLE)',
    children: 'Reaps parent + spawned `virus` copies / `forkbomb` zombies',
    linuxMeaning: 'Immediate hard termination by the OS kernel. The process gets zero chance to intercept, delay, or clean up.',
    gameEffect: 'Essential for `virus` (prevents splitting!) and `forkbomb` PID `666` (ends it + all forked zombies!). Still blocked on `root` processes.',
    command: 'kill -9 <pid>',
  },
  {
    id: 'stop',
    flag: '-STOP',
    num: '19 / 17 / 23',
    name: 'SIGSTOP (Freeze / Pause)',
    trappable: 'NO — Kernel suspends process immediately (STAT=T)',
    children: 'Freezes target so it cannot fork or replicate',
    linuxMeaning: 'Pauses CPU scheduling without killing the process. Useful to inspect state or halt runaway loops safely.',
    gameEffect: 'Freezes `forkbomb` (stops zombie spawning and unlocks `core_elevator`) or freezes `virus` so `rm` deletes it cleanly!',
    command: 'kill -STOP <pid>',
  },
  {
    id: 'cont',
    flag: '-CONT',
    num: '18',
    name: 'SIGCONT (Resume)',
    trappable: 'Kernel wakes stopped process back to active state',
    children: 'Target resumes normal execution',
    linuxMeaning: 'Resumes any process previously paused by `SIGSTOP` (`STAT=T` -> `R/S`).',
    gameEffect: 'Thaws a frozen process (generally only needed in debugging or lab tests).',
    command: 'kill -CONT <pid>',
  },
];

const SHELL_OP_CASES: ReadonlyArray<{
  id: string;
  op: string;
  title: string;
  command: string;
  steps: readonly [string, string, string];
}> = [
  {
    id: 'pipe',
    op: '|',
    title: 'Pipe stdout -> stdin',
    command: 'grep "^PASS=" boiler.dump | cut -d= -f2 | rev',
    steps: ['1. `grep` outputs matching `PASS=9042_ECANRUF` line', '2. `cut -d= -f2` strips key -> `9042_ECANRUF`', '3. `rev` reverses text -> `FURNACE_2409`'],
  },
  {
    id: 'redir',
    op: '> / >>',
    title: 'Redirect to File or Socket',
    command: 'echo align > pressure_plate.sock',
    steps: ['1. `echo align` produces stdout `align`', '2. `>` sends stdout directly into `pressure_plate.sock` (`>>` appends to files)', '3. Redirecting to `/dev/null` discards or drains `.stream` hazards'],
  },
  {
    id: 'and',
    op: '&& / || / ;',
    title: 'Chain Commands in One Turn',
    command: 'rm -f .poltergeist.lock && touch cellar_hatch/.power_on && cd cellar_hatch',
    steps: ['1. `rm -f` deletes lock (exit 0 even if missing)', '2. `&&` continues only if previous exit code = 0 (`||` runs on failure; `;` always runs)', '3. All steps run in ONE battle turn!'],
  },
  {
    id: 'glob',
    op: '* ? {a,b}',
    title: 'Globs & Brace Expansion',
    command: 'touch pedestal/{a,b,c}.rune',
    steps: ['1. `{a,b,c}.rune` expands in classic mode (`a.rune b.rune c.rune`); chapter expands `~` and `*`/`?` globs', '2. `*.log` matches all `.log` files in cwd (`?` matches 1 char)', '3. Quote globs in `find -name "*.py"` so shell keeps `*` literal for `find`'],
  },
];

function renderChmodCalculator(actions: BookActions): HTMLElement {
  let mode = 0o644;
  const wrap = el('section', 'mb-widget mb-chmod-widget');
  wrap.append(el('h4', 'mb-widget-title', ['Interactive chmod Octal & Permission Calculator']));

  const presets = el('div', 'mb-preset-row');
  const grid = el('div', 'mb-perm-grid');
  const octalInput = document.createElement('input');
  octalInput.type = 'text';
  octalInput.maxLength = 3;
  octalInput.className = 'mb-octal-input';
  octalInput.id = 'mb-octal-input';
  octalInput.value = '644';
  octalInput.setAttribute('aria-label', 'Type 3-digit chmod octal number (000 to 777)');
  const octalBig = el('div', 'mb-octal-big', ['chmod 644']);
  const modeStr = el('div', 'mb-mode-str', ['-rw-r--r--']);
  const symStr = el('div', 'mb-sym-str', ['u=rw,g=r,o=r']);
  const stepsEl = el('div', 'mb-octal-steps', ['u: 4+2+0=6 · g: 4+0+0=4 · o: 4+0+0=4']);
  const mathBox = el('div', 'mb-chmod-math', [
    el('label', 'mb-octal-edit', [el('span', '', ['Number']), octalInput]),
    octalBig,
    modeStr,
    symStr,
    stepsEl,
  ]);
  const digitKey = el('div', 'mb-digit-key', [
    'Digits: 7=rwx (4+2+1) · 6=rw- (4+2) · 5=r-x (4+1) · 4=r-- · 3=-wx · 2=-w- · 1=--x · 0=---',
  ]);
  const summaryEl = el('p', 'mb-chmod-summary');
  const cmdHost = el('div', 'mb-widget-cmd');
  const hintEl = el('p', 'mb-chmod-hint');

  const roles: ReadonlyArray<{ label: string; shift: number }> = [
    { label: 'Owner (u)', shift: 6 },
    { label: 'Group (g)', shift: 3 },
    { label: 'Others (o)', shift: 0 },
  ];
  const bits: ReadonlyArray<{ label: string; bit: number }> = [
    { label: 'r (4)', bit: 4 },
    { label: 'w (2)', bit: 2 },
    { label: 'x (1)', bit: 1 },
  ];
  const checkboxes: Array<{ input: HTMLInputElement; mask: number }> = [];

  for (const role of roles) {
    const row = el('div', 'mb-perm-row', [el('span', 'mb-perm-role', [role.label])]);
    for (const b of bits) {
      const mask = b.bit << role.shift;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('aria-label', `${role.label} ${b.label}`);
      input.addEventListener('change', () => {
        mode = input.checked ? mode | mask : mode & ~mask;
        sync(true);
      });
      checkboxes.push({ input, mask });
      row.append(el('label', 'mb-perm-cell', [input, el('span', '', [b.label])]));
    }
    grid.append(row);
  }

  for (const preset of CHMOD_PRESETS) {
    presets.append(
      btn(preset.label, 'mb-chip-btn', () => {
        mode = preset.mode;
        sync(true);
      }),
    );
  }

  octalInput.addEventListener('input', () => {
    const raw = octalInput.value.trim();
    if (/^[0-7]{3}$/.test(raw)) {
      mode = Number.parseInt(raw, 8);
      sync(false);
    }
  });

  function sync(updateField: boolean): void {
    for (const cb of checkboxes) cb.input.checked = (mode & cb.mask) !== 0;
    const info = formatChmodPreview(mode);
    const [u, g, o] = info.ownerDigits;
    const formula = (d: number) => `${d & 4 ? 4 : 0}+${d & 2 ? 2 : 0}+${d & 1 ? 1 : 0}=${d}`;
    if (updateField) octalInput.value = info.octal;
    octalBig.textContent = `chmod ${info.octal}`;
    modeStr.textContent = info.modeText;
    symStr.textContent = info.symbolic;
    stepsEl.textContent = `u: ${formula(u)} · g: ${formula(g)} · o: ${formula(o)}`;
    summaryEl.textContent = info.summary;
    const preset = CHMOD_PRESETS.find((p) => p.mode === mode);
    const hintText = preset
      ? preset.hint
      : mode & 0o111
        ? 'Execute bit is ON: scripts can run and directories allow `cd` traversal.'
        : 'Execute bit is OFF: binaries stay petrified and directories block `cd`.';
    hintEl.replaceChildren(inlineCodeFragment(hintText));
    cmdHost.replaceChildren(commandBar(`chmod ${info.octal} <file>`, actions, true));
  }

  wrap.append(presets, grid, mathBox, digitKey, summaryEl, hintEl, cmdHost);
  sync(true);
  return wrap;
}

function renderTabbedInspector<T extends { id: string; command: string }>(
  cls: string,
  heading: string,
  items: readonly T[],
  labelFor: (item: T) => string,
  bodyFor: (item: T) => HTMLElement[],
  actions: BookActions,
): HTMLElement {
  let activeId = items[0]!.id;
  const wrap = el('section', `mb-widget ${cls}`);
  wrap.append(el('h4', 'mb-widget-title', [heading]));
  const tabs = el('div', 'mb-preset-row');
  const card = el('div', 'mb-signal-card');
  const cmdHost = el('div', 'mb-widget-cmd');
  const tabBtns = new Map<string, HTMLButtonElement>();

  function renderActive(): void {
    const item = items.find((entry) => entry.id === activeId) ?? items[0]!;
    for (const [id, b] of tabBtns) b.classList.toggle('active', id === item.id);
    card.replaceChildren(...bodyFor(item));
    cmdHost.replaceChildren(commandBar(item.command, actions, true));
  }

  for (const item of items) {
    const b = btn(labelFor(item), 'mb-chip-btn', () => {
      activeId = item.id;
      renderActive();
    });
    tabBtns.set(item.id, b);
    tabs.append(b);
  }

  wrap.append(tabs, card, cmdHost);
  renderActive();
  return wrap;
}

function renderKillSignalTester(actions: BookActions): HTMLElement {
  return renderTabbedInspector(
    'mb-signal-widget',
    'Interactive POSIX Signal Tester (kill / pkill)',
    SIGNAL_CASES,
    (sig) => `${sig.flag} ${sig.name.split(' ')[0]}`,
    (sig) => [
      el('div', 'mb-sig-head', [el('strong', 'mb-sig-flag', [`${sig.flag} · ${sig.name}`]), el('span', 'mb-sig-num', [`Signal #${sig.num}`])]),
      el('p', 'mb-sig-row', [el('b', '', ['Trappable? ']), inlineCodeFragment(sig.trappable)]),
      el('p', 'mb-sig-row', [el('b', '', ['Child Processes: ']), inlineCodeFragment(sig.children)]),
      el('p', 'mb-sig-row', [el('b', '', ['Real Linux: ']), inlineCodeFragment(sig.linuxMeaning)]),
      el('p', 'mb-sig-row mb-sig-game', [el('b', '', ['In-Game: ']), inlineCodeFragment(sig.gameEffect)]),
    ],
    actions,
  );
}

function renderShellPlayground(actions: BookActions): HTMLElement {
  return renderTabbedInspector(
    'mb-shell-widget',
    'Interactive Shell Operator & Pipeline Explorer',
    SHELL_OP_CASES,
    (item) => `${item.op} ${item.title.split(' ')[0]}`,
    (item) => [
      el('div', 'mb-sig-head', [el('strong', 'mb-sig-flag', [item.op]), el('span', 'mb-sig-num', [item.title])]),
      el('ol', 'mb-step-list', item.steps.map((s) => el('li', '', [inlineCodeFragment(s)]))),
    ],
    actions,
  );
}

export function renderManualWidget(kind: ManualWidgetKind, actions: BookActions): HTMLElement {
  if (kind === 'chmod-calc') return renderChmodCalculator(actions);
  if (kind === 'kill-signals') return renderKillSignalTester(actions);
  return renderShellPlayground(actions);
}
